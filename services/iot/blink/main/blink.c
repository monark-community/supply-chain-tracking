#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c_master.h"
#include "esp_log.h"
#include "esp_err.h"

#ifndef ESP_RETURN_ON_ERROR
#define ESP_RETURN_ON_ERROR(x, tag, msg) do {            \
    esp_err_t __e = (x);                                 \
    if (__e != ESP_OK) {                                 \
        ESP_LOGE((tag), "%s: %s", (msg), esp_err_to_name(__e)); \
        return __e;                                      \
    }                                                    \
} while(0)
#endif


// ------------------- Config -------------------
static const char *TAG = "PN532_I2C";

// Change these to your wiring
#define I2C_PORT_NUM        I2C_NUM_0
#define I2C_SDA_GPIO 2
#define I2C_SCL_GPIO 3
#define I2C_FREQ_HZ         100000

// PN532 I2C address (7-bit)
#define PN532_I2C_ADDR      0x24

// PN532 frame constants
#define PN532_PREAMBLE      0x00
#define PN532_STARTCODE1    0x00
#define PN532_STARTCODE2    0xFF
#define PN532_POSTAMBLE     0x00

#define PN532_HOSTTOPN532   0xD4
#define PN532_PN532TOHOST   0xD5

// Commands
#define PN532_CMD_GETFIRMWAREVERSION  0x02
#define PN532_CMD_SAMCONFIGURATION    0x14
#define PN532_CMD_INLISTPASSIVETARGET 0x4A

// PN532 I2C ready byte (read 1 byte; 0x01 means ready)
#define PN532_I2C_READY      0x01

static i2c_master_bus_handle_t s_bus = NULL;
static i2c_master_dev_handle_t s_dev = NULL;

// ------------------- Helpers -------------------
static uint8_t checksum_sum(const uint8_t *data, size_t len)
{
    uint8_t sum = 0;
    for (size_t i = 0; i < len; i++) sum += data[i];
    return sum;
}

static esp_err_t pn532_i2c_write(const uint8_t *data, size_t len)
{
    // PN532 I2C requires a leading 0x00 for write
    uint8_t buf[1 + 255];
    if (len > 255) return ESP_ERR_INVALID_SIZE;

    buf[0] = 0x00;
    memcpy(&buf[1], data, len);
    return i2c_master_transmit(s_dev, buf, len + 1, 1000);
}

static esp_err_t pn532_i2c_read(uint8_t *data, size_t len)
{
    return i2c_master_receive(s_dev, data, len, 1000);
}

static esp_err_t pn532_wait_ready(uint32_t timeout_ms)
{
    TickType_t start = xTaskGetTickCount();
    TickType_t timeout_ticks = pdMS_TO_TICKS(timeout_ms);

    while ((xTaskGetTickCount() - start) < timeout_ticks) {
        uint8_t b = 0x00;
        esp_err_t err = pn532_i2c_read(&b, 1);
        if (err == ESP_OK && b == PN532_I2C_READY) return ESP_OK;
        vTaskDelay(pdMS_TO_TICKS(10));
    }
    return ESP_ERR_TIMEOUT;
}

// Build and send a PN532 command frame: (TFI + CMD + DATA...)
static esp_err_t pn532_send_command(const uint8_t *cmd_data, size_t cmd_len)
{
    if (cmd_len == 0 || cmd_len > 255) return ESP_ERR_INVALID_SIZE;

    // Frame: 00 00 FF LEN LCS [DATA...] DCS 00
    uint8_t len = (uint8_t)cmd_len;
    uint8_t lcs = (uint8_t)(0x100 - len);

    uint8_t dsum = checksum_sum(cmd_data, cmd_len);
    uint8_t dcs  = (uint8_t)(0x100 - dsum);

    uint8_t frame[8 + 255];
    size_t idx = 0;
    frame[idx++] = PN532_PREAMBLE;
    frame[idx++] = PN532_STARTCODE1;
    frame[idx++] = PN532_STARTCODE2;
    frame[idx++] = len;
    frame[idx++] = lcs;
    memcpy(&frame[idx], cmd_data, cmd_len);
    idx += cmd_len;
    frame[idx++] = dcs;
    frame[idx++] = PN532_POSTAMBLE;

    esp_err_t err = pn532_i2c_write(frame, idx);
    if (err != ESP_OK) return err;

    // Wait for ACK
    err = pn532_wait_ready(1000);
    if (err != ESP_OK) return err;

    // ACK: status + 6 bytes => 01 00 00 FF 00 FF 00
    uint8_t ack[1 + 6] = {0};
    err = pn532_i2c_read(ack, sizeof(ack));
    if (err != ESP_OK) return err;

    if (!(ack[1] == 0x00 && ack[2] == 0x00 && ack[3] == 0xFF &&
          ack[4] == 0x00 && ack[5] == 0xFF && ack[6] == 0x00)) {
        ESP_LOGW(TAG, "Unexpected ACK frame");
    }
    return ESP_OK;
}

// Read PN532 response payload (TFI..), returns payload length
static esp_err_t pn532_read_response(uint8_t *out, size_t out_max, size_t *out_len, uint32_t timeout_ms)
{
    if (!out || !out_len) return ESP_ERR_INVALID_ARG;

    esp_err_t err = pn532_wait_ready(timeout_ms);
    if (err != ESP_OK) return err;

    // Read: status + 00 00 FF LEN LCS
    uint8_t hdr[1 + 5] = {0};
    err = pn532_i2c_read(hdr, sizeof(hdr));
    if (err != ESP_OK) return err;

    if (hdr[1] != 0x00 || hdr[2] != 0x00 || hdr[3] != 0xFF) {
        ESP_LOGE(TAG, "Bad response preamble/start");
        return ESP_FAIL;
    }

    uint8_t len = hdr[4];
    uint8_t lcs = hdr[5];
    if ((uint8_t)(len + lcs) != 0x00) {
        ESP_LOGE(TAG, "Bad LCS");
        return ESP_FAIL;
    }

    if ((size_t)len + 2 > out_max) {
        ESP_LOGE(TAG, "Response too large (%u)", len);
        return ESP_ERR_NO_MEM;
    }

    // Read payload(len) + dcs + post
    uint8_t tail[255 + 2];
    err = pn532_i2c_read(tail, (size_t)len + 2);
    if (err != ESP_OK) return err;

    uint8_t dcs = tail[len];
    uint8_t post = tail[len + 1];
    if (post != 0x00) {
        ESP_LOGE(TAG, "Bad postamble");
        return ESP_FAIL;
    }

    uint8_t sum = checksum_sum(tail, len);
    if ((uint8_t)(sum + dcs) != 0x00) {
        ESP_LOGE(TAG, "Bad DCS");
        return ESP_FAIL;
    }

    memcpy(out, tail, len);
    *out_len = len;
    return ESP_OK;
}

// ------------------- PN532 Commands -------------------
static esp_err_t pn532_get_firmware(uint32_t *fw)
{
    if (!fw) return ESP_ERR_INVALID_ARG;

    uint8_t cmd[] = { PN532_HOSTTOPN532, PN532_CMD_GETFIRMWAREVERSION };

    esp_err_t err = pn532_send_command(cmd, sizeof(cmd));
    if (err != ESP_OK) return err;

    uint8_t resp[64] = {0};
    size_t rlen = 0;

    err = pn532_read_response(resp, sizeof(resp), &rlen, 1000);
    if (err != ESP_OK) return err;

    // Expect: D5 03 IC Ver Rev Support
    if (rlen < 6 || resp[0] != PN532_PN532TOHOST || resp[1] != (PN532_CMD_GETFIRMWAREVERSION + 1)) {
        ESP_LOGE(TAG, "Unexpected firmware response");
        return ESP_FAIL;
    }

    *fw = ((uint32_t)resp[2] << 24) | ((uint32_t)resp[3] << 16) | ((uint32_t)resp[4] << 8) | (uint32_t)resp[5];
    return ESP_OK;
}

static esp_err_t pn532_sam_config(void)
{
    uint8_t cmd[] = { PN532_HOSTTOPN532, PN532_CMD_SAMCONFIGURATION, 0x01, 0x14, 0x01 };

    esp_err_t err = pn532_send_command(cmd, sizeof(cmd));
    if (err != ESP_OK) return err;

    uint8_t resp[32] = {0};
    size_t rlen = 0;

    err = pn532_read_response(resp, sizeof(resp), &rlen, 1000);
    if (err != ESP_OK) return err;

    if (rlen < 2 || resp[0] != PN532_PN532TOHOST || resp[1] != (PN532_CMD_SAMCONFIGURATION + 1)) {
        ESP_LOGE(TAG, "Unexpected SAM response");
        return ESP_FAIL;
    }
    return ESP_OK;
}

static esp_err_t pn532_poll_uid(uint8_t *uid, size_t uid_max, size_t *uid_len)
{
    if (!uid || !uid_len) return ESP_ERR_INVALID_ARG;

    uint8_t cmd[] = { PN532_HOSTTOPN532, PN532_CMD_INLISTPASSIVETARGET, 0x01, 0x00 };

    esp_err_t err = pn532_send_command(cmd, sizeof(cmd));
    if (err != ESP_OK) return err;

    uint8_t resp[128] = {0};
    size_t rlen = 0;

    err = pn532_read_response(resp, sizeof(resp), &rlen, 1500);
    if (err != ESP_OK) return err;

    // Response: D5 4B NbTg Tg SensRes(2) SelRes NFCIDLen NFCID...
    if (rlen < 8 || resp[0] != PN532_PN532TOHOST || resp[1] != (PN532_CMD_INLISTPASSIVETARGET + 1)) {
        return ESP_FAIL;
    }

    if (resp[2] == 0x00) return ESP_ERR_NOT_FOUND;

    uint8_t nfcid_len = resp[7];
    if (8 + nfcid_len > rlen) return ESP_FAIL;
    if (nfcid_len > uid_max) return ESP_ERR_NO_MEM;

    memcpy(uid, &resp[8], nfcid_len);
    *uid_len = nfcid_len;
    return ESP_OK;
}

// ------------------- I2C Init -------------------
static void i2c_init(void)
{
    i2c_master_bus_config_t bus_cfg = {
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .i2c_port = I2C_PORT_NUM,
        .sda_io_num = I2C_SDA_GPIO,
        .scl_io_num = I2C_SCL_GPIO,
        .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = true,
    };
    ESP_ERROR_CHECK(i2c_new_master_bus(&bus_cfg, &s_bus));

    i2c_device_config_t dev_cfg = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = PN532_I2C_ADDR,
        .scl_speed_hz = I2C_FREQ_HZ,
    };
    ESP_ERROR_CHECK(i2c_master_bus_add_device(s_bus, &dev_cfg, &s_dev));
}

// ------------------- app_main -------------------
void app_main(void)
{
    i2c_init();
    ESP_LOGI(TAG, "I2C ready. SDA=%d SCL=%d", I2C_SDA_GPIO, I2C_SCL_GPIO);

    vTaskDelay(pdMS_TO_TICKS(200));

    uint32_t fw = 0;
    esp_err_t err = pn532_get_firmware(&fw);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "PN532 not responding over I2C. err=%s", esp_err_to_name(err));
        return;
    }

    ESP_LOGI(TAG, "PN532 FW: IC=0x%02X Ver=%u Rev=%u Support=0x%02X",
             (uint8_t)(fw >> 24), (uint8_t)(fw >> 16), (uint8_t)(fw >> 8), (uint8_t)fw);

    err = pn532_sam_config();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "SAM config failed: %s", esp_err_to_name(err));
        return;
    }

    ESP_LOGI(TAG, "SAM configured. Tap a card...");

    while (1) {
        uint8_t uid[10] = {0};
        size_t uid_len = 0;

        err = pn532_poll_uid(uid, sizeof(uid), &uid_len);
        if (err == ESP_OK) {
            char hex[3 * 10 + 1] = {0};
            for (size_t i = 0; i < uid_len; i++) {
                snprintf(&hex[i * 3], sizeof(hex) - (i * 3),
                         "%02X%s", uid[i], (i + 1 < uid_len) ? ":" : "");
            }
            ESP_LOGI(TAG, "Card UID (%u bytes): %s", (unsigned)uid_len, hex);
            vTaskDelay(pdMS_TO_TICKS(1500));
        } else {
            vTaskDelay(pdMS_TO_TICKS(300));
        }
    }
}
