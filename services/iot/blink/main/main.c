#if 0 // BLE_DISABLED_TEMP
#include <stdio.h>
#include <string.h>
#include <math.h>
#include <stdint.h>
#include <stdbool.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"

#include "nvs_flash.h"
#include "esp_log.h"
#include "esp_err.h"
#include "esp_check.h"
#include "esp_timer.h"

#include "driver/gpio.h"
#include "esp_rom_sys.h"
#include "dht.h"

#include "os/os_mbuf.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "host/ble_hs.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"

#define DHT_GPIO              GPIO_NUM_4
#define SAMPLE_PERIOD_MS      3000
#define DHT_STARTUP_DELAY_MS  2000
#define DHT_READ_RETRIES      3
#define DHT_RETRY_DELAY_MS    30

#define TEMP_MIN_ALLOWED_C    (10.0f)
#define TEMP_MAX_ALLOWED_C    (30.0f)
#define HUMI_MIN_ALLOWED_PCT  (5.0f)
#define HUMI_MAX_ALLOWED_PCT  (50.0f)

#define FLAG_OK        0x0
#define FLAG_TEMP_OOR  0x1
#define FLAG_HUMI_OOR  0x2
#define CTRL_CMD_STREAM_START     0x01
#define CTRL_CMD_STREAM_STOP      0x02
#define CTRL_CMD_HISTORY_CLEAR    0x03
#define CTRL_CMD_SET_ACTIVE_BATCH 0x04
#define CTRL_CMD_CLEAR_ACTIVE_BATCH 0x05

#define MANUAL_MODE 0
#define MAN_TEMP_MIN  15.0f
#define MAN_TEMP_MAX  30.0f
#define MAN_HUMI_MIN  20.0f
#define MAN_HUMI_MAX  70.0f
#define MAN_FLAG      2

#define HISTORY_MAX 256

static const char *TAG = "BLE_DHT22";

typedef struct __attribute__((packed)) {
    float temp_min;
    float temp_max;
    float humi_min;
    float humi_max;
    uint8_t flag2;
    uint8_t has_batch;
    uint32_t batch_id;
} payload_t;

typedef struct __attribute__((packed)) {
    uint32_t ts_s;
    float temp_c;
    float humi_pct;
    uint8_t flag2;
    uint16_t seq;
} rec_t;

static payload_t g_payload;
static bool g_initialized = false;
static bool g_has_active_batch = false;
static uint32_t g_active_batch_id = 0;

static rec_t g_hist[HISTORY_MAX];
static uint16_t g_hist_head = 0;
static uint16_t g_hist_count = 0;
static uint16_t g_seq = 0;

static SemaphoreHandle_t g_lock;

static uint8_t g_own_addr_type;
static uint16_t g_conn_handle = BLE_HS_CONN_HANDLE_NONE;

static uint16_t g_attr_handle_payload;
static uint16_t g_attr_handle_ctrl;
static uint16_t g_attr_handle_hist;

static bool g_sub_payload = false;
static bool g_sub_hist = false;

static volatile bool g_streaming = false;
static volatile bool g_stream_req_start = false;
static volatile bool g_stream_req_stop = false;

static const ble_uuid128_t g_svc_uuid =
    BLE_UUID128_INIT(0x01,0x10,0xef,0xbe,0xed,0xfe,0x0d,0x1c,0x2b,0x3a,0x4f,0x5e,0x6d,0x7c,0x8b,0x9a);

static const ble_uuid128_t g_chr_uuid_payload =
    BLE_UUID128_INIT(0x02,0x10,0xef,0xbe,0xed,0xfe,0x0d,0x1c,0x2b,0x3a,0x4f,0x5e,0x6d,0x7c,0x8b,0x9a);

static const ble_uuid128_t g_chr_uuid_ctrl =
    BLE_UUID128_INIT(0x03,0x10,0xef,0xbe,0xed,0xfe,0x0d,0x1c,0x2b,0x3a,0x4f,0x5e,0x6d,0x7c,0x8b,0x9a);

static const ble_uuid128_t g_chr_uuid_hist =
    BLE_UUID128_INIT(0x04,0x10,0xef,0xbe,0xed,0xfe,0x0d,0x1c,0x2b,0x3a,0x4f,0x5e,0x6d,0x7c,0x8b,0x9a);

static const char *BLE_SERVICE_UUID_STR = "9a8b7c6d-5e4f-3a2b-1c0d-feedbeef1001";
static const char *BLE_CHAR_PAYLOAD_UUID_STR = "9a8b7c6d-5e4f-3a2b-1c0d-feedbeef1002";
static const char *BLE_CHAR_CTRL_UUID_STR = "9a8b7c6d-5e4f-3a2b-1c0d-feedbeef1003";
static const char *BLE_CHAR_HIST_UUID_STR = "9a8b7c6d-5e4f-3a2b-1c0d-feedbeef1004";

static esp_err_t dht22_read(gpio_num_t pin, float *temp_c, float *humi_pct)
{
    float h = NAN;
    float t = NAN;

    esp_err_t rc = dht_read_float_data(DHT_TYPE_AM2301, pin, &h, &t);
    if (rc != ESP_OK) return rc;

    // Guard against ghost frames observed as repeated 0.00/0.00 values.
    if (fabsf(t) < 0.001f && fabsf(h) < 0.001f) return ESP_ERR_INVALID_RESPONSE;

    *temp_c = t;
    *humi_pct = h;
    return ESP_OK;
}
#endif // BLE_DISABLED_TEMP

#include <stdio.h>
#include <string.h>
#include <math.h>
#include <stdint.h>
#include <stdbool.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"

#include "nvs_flash.h"
#include "esp_log.h"
#include "esp_err.h"
#include "esp_timer.h"

#include "driver/gpio.h"
#include "driver/i2c.h"
#include "dht.h"

#define DHT_GPIO              GPIO_NUM_4
#define SAMPLE_PERIOD_MS      3000
#define DHT_STARTUP_DELAY_MS  2000
#define DHT_READ_RETRIES      3
#define DHT_RETRY_DELAY_MS    30

#define TEMP_MIN_ALLOWED_C    (10.0f)
#define TEMP_MAX_ALLOWED_C    (30.0f)
#define HUMI_MIN_ALLOWED_PCT  (5.0f)
#define HUMI_MAX_ALLOWED_PCT  (50.0f)

#define FLAG_OK        0x0
#define FLAG_TEMP_OOR  0x1
#define FLAG_HUMI_OOR  0x2

#define PN532_I2C_PORT        I2C_NUM_0
#define PN532_I2C_SDA_GPIO    GPIO_NUM_8
#define PN532_I2C_SCL_GPIO    GPIO_NUM_9
#define PN532_I2C_FREQ_HZ     100000
#define PN532_I2C_ADDR_7BIT   0x24

#define PN532_PREAMBLE        0x00
#define PN532_STARTCODE1      0x00
#define PN532_STARTCODE2      0xFF
#define PN532_POSTAMBLE       0x00
#define PN532_HOSTTOPN532     0xD4
#define PN532_PN532TOHOST     0xD5

#define PN532_CMD_SAMCONFIGURATION 0x14
#define PN532_CMD_GETFIRMWAREVERSION 0x02
#define PN532_CMD_TGINITASTARGET   0x8C
#define PN532_CMD_TGGETDATA        0x86
#define PN532_CMD_TGSETDATA        0x8E

#define PN532_ACK_FRAME_LEN        6
#define PN532_MAX_RETRIES          3
#define PN532_INIT_RETRY_DELAY_MS  2000
#define PN532_FALLBACK_I2C_HZ      50000
#define SCAN_DEBOUNCE_MS           500
#define SCAN_REPEAT_WINDOW_MS      1500

static const char *TAG = "PN532_DHT22";
static const uint8_t PN532_ACK_FRAME[PN532_ACK_FRAME_LEN] = {0x00, 0x00, 0xFF, 0x00, 0xFF, 0x00};
static uint8_t g_pn532_addr = PN532_I2C_ADDR_7BIT;
static uint32_t g_i2c_clk_hz = PN532_I2C_FREQ_HZ;

typedef struct __attribute__((packed)) {
    float temp_min;
    float temp_max;
    float humi_min;
    float humi_max;
    uint8_t flag2;
    uint8_t has_batch;
    uint32_t batch_id;
    float latest_temp_c;
    float latest_humi_pct;
    uint32_t updated_ts_s;
} payload_t;

static payload_t g_payload;
static bool g_initialized = false;
static SemaphoreHandle_t g_lock;
static char g_ndef_text[196];
static int64_t g_last_scan_ts_us = 0;
static uint8_t g_last_scan_frame[16];
static size_t g_last_scan_frame_len = 0;

static uint8_t compute_flag(float t, float h)
{
    if (t < TEMP_MIN_ALLOWED_C || t > TEMP_MAX_ALLOWED_C) return FLAG_TEMP_OOR;
    if (h < HUMI_MIN_ALLOWED_PCT || h > HUMI_MAX_ALLOWED_PCT) return FLAG_HUMI_OOR;
    return FLAG_OK;
}

static esp_err_t dht22_read(gpio_num_t pin, float *temp_c, float *humi_pct)
{
    float h = NAN;
    float t = NAN;

    esp_err_t rc = dht_read_float_data(DHT_TYPE_AM2301, pin, &h, &t);
    if (rc != ESP_OK) return rc;

    if (fabsf(t) < 0.001f && fabsf(h) < 0.001f) return ESP_ERR_INVALID_RESPONSE;

    *temp_c = t;
    *humi_pct = h;
    return ESP_OK;
}

static void update_payload(float t, float h)
{
    uint8_t flag = compute_flag(t, h);
    uint32_t ts_s = (uint32_t)(esp_timer_get_time() / 1000000ULL);

    xSemaphoreTake(g_lock, portMAX_DELAY);
    if (!g_initialized) {
        g_payload.temp_min = t;
        g_payload.temp_max = t;
        g_payload.humi_min = h;
        g_payload.humi_max = h;
        g_initialized = true;
    } else {
        if (t < g_payload.temp_min) g_payload.temp_min = t;
        if (t > g_payload.temp_max) g_payload.temp_max = t;
        if (h < g_payload.humi_min) g_payload.humi_min = h;
        if (h > g_payload.humi_max) g_payload.humi_max = h;
    }

    g_payload.flag2 = flag;
    g_payload.latest_temp_c = t;
    g_payload.latest_humi_pct = h;
    g_payload.updated_ts_s = ts_s;
    xSemaphoreGive(g_lock);
}

static void refresh_ndef_payload(void)
{
    payload_t snap;
    xSemaphoreTake(g_lock, portMAX_DELAY);
    snap = g_payload;
    xSemaphoreGive(g_lock);

    snprintf(
        g_ndef_text,
        sizeof(g_ndef_text),
        "temp_c=%.2f;humi_pct=%.2f;flag=%u;batch_id=%lu;ts=%lu",
        snap.latest_temp_c,
        snap.latest_humi_pct,
        (unsigned int)snap.flag2,
        (unsigned long)snap.batch_id,
        (unsigned long)snap.updated_ts_s
    );
}

static esp_err_t pn532_i2c_init(void)
{
    i2c_config_t conf = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = PN532_I2C_SDA_GPIO,
        .scl_io_num = PN532_I2C_SCL_GPIO,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master.clk_speed = g_i2c_clk_hz,
    };

    (void)i2c_driver_delete(PN532_I2C_PORT);
    esp_err_t err = i2c_param_config(PN532_I2C_PORT, &conf);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "i2c_param_config failed: %s", esp_err_to_name(err));
        return err;
    }
    err = i2c_driver_install(PN532_I2C_PORT, conf.mode, 0, 0, 0);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "i2c_driver_install failed: %s", esp_err_to_name(err));
        return err;
    }
    return ESP_OK;
}

static esp_err_t pn532_write_raw(const uint8_t *data, size_t len)
{
    return i2c_master_write_to_device(PN532_I2C_PORT, g_pn532_addr, data, len, pdMS_TO_TICKS(200));
}

static esp_err_t pn532_read_raw(uint8_t *data, size_t len)
{
    return i2c_master_read_from_device(PN532_I2C_PORT, g_pn532_addr, data, len, pdMS_TO_TICKS(200));
}

static void pn532_log_bytes(const char *label, const uint8_t *buf, size_t len)
{
    char line[192];
    size_t max = len > 20 ? 20 : len;
    int off = snprintf(line, sizeof(line), "%s (%uB):", label, (unsigned)len);
    for (size_t i = 0; i < max && off > 0 && off < (int)sizeof(line) - 4; i++) {
        off += snprintf(&line[off], sizeof(line) - (size_t)off, " %02X", buf[i]);
    }
    ESP_LOGW(TAG, "%s%s", line, len > max ? " ..." : "");
}

static void pn532_log_i2c_line_levels(const char *stage)
{
    gpio_config_t io = {
        .pin_bit_mask = (1ULL << PN532_I2C_SDA_GPIO) | (1ULL << PN532_I2C_SCL_GPIO),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    (void)gpio_config(&io);

    int sda = gpio_get_level(PN532_I2C_SDA_GPIO);
    int scl = gpio_get_level(PN532_I2C_SCL_GPIO);
    ESP_LOGI(TAG, "%s: I2C line levels SDA=%d SCL=%d (expect 1/1 idle)", stage, sda, scl);
    if (sda == 0 || scl == 0) {
        ESP_LOGW(TAG, "I2C line held low before transfer. Check pull-ups/wiring/shorts.");
    }
}

static esp_err_t i2c_probe_addr(uint8_t addr7)
{
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    if (!cmd) return ESP_ERR_NO_MEM;
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (addr7 << 1) | I2C_MASTER_WRITE, true);
    i2c_master_stop(cmd);
    esp_err_t err = i2c_master_cmd_begin(PN532_I2C_PORT, cmd, pdMS_TO_TICKS(200));
    i2c_cmd_link_delete(cmd);
    return err;
}

static int pn532_scan_i2c_bus(uint8_t *found, size_t found_cap)
{
    int count = 0;
    ESP_LOGI(TAG, "Scanning I2C bus for ACK addresses...");
    for (uint8_t addr = 0x08; addr < 0x78; addr++) {
        if (i2c_probe_addr(addr) == ESP_OK) {
            ESP_LOGI(TAG, "I2C device ACK at 0x%02X", addr);
            if ((size_t)count < found_cap) {
                found[count] = addr;
            }
            count++;
        }
    }
    if (count == 0) {
        ESP_LOGW(TAG, "No I2C ACK devices detected.");
    }
    return count;
}

static esp_err_t pn532_probe_device(void)
{
    return i2c_probe_addr(g_pn532_addr);
}

static esp_err_t pn532_wait_ready(uint32_t timeout_ms)
{
    uint32_t elapsed = 0;
    while (elapsed < timeout_ms) {
        uint8_t status = 0;
        if (pn532_read_raw(&status, 1) == ESP_OK && status == 0x01) return ESP_OK;
        vTaskDelay(pdMS_TO_TICKS(10));
        elapsed += 10;
    }
    return ESP_ERR_TIMEOUT;
}

static esp_err_t pn532_read_ack_frame(void)
{
    uint8_t ack[PN532_ACK_FRAME_LEN + 1] = {0};
    esp_err_t err = pn532_read_raw(ack, sizeof(ack));
    if (err != ESP_OK) return err;
    if (memcmp(&ack[1], PN532_ACK_FRAME, PN532_ACK_FRAME_LEN) != 0) {
        pn532_log_bytes("Unexpected ACK frame", ack, sizeof(ack));
        return ESP_ERR_INVALID_RESPONSE;
    }
    return ESP_OK;
}

static esp_err_t pn532_send_command(uint8_t cmd, const uint8_t *payload, size_t payload_len)
{
    uint8_t frame[96];
    const size_t data_len = payload_len + 2; // TFI + CMD + payload
    if (data_len > 0xFF || data_len + 8 > sizeof(frame)) return ESP_ERR_INVALID_SIZE;

    size_t idx = 0;
    frame[idx++] = 0x00; // I2C host preamble byte
    frame[idx++] = PN532_PREAMBLE;
    frame[idx++] = PN532_STARTCODE1;
    frame[idx++] = PN532_STARTCODE2;
    frame[idx++] = (uint8_t)data_len;
    frame[idx++] = (uint8_t)(~data_len + 1);
    frame[idx++] = PN532_HOSTTOPN532;
    frame[idx++] = cmd;
    for (size_t i = 0; i < payload_len; i++) {
        frame[idx++] = payload[i];
    }

    uint8_t dcs = (uint8_t)(PN532_HOSTTOPN532 + cmd);
    for (size_t i = 0; i < payload_len; i++) dcs = (uint8_t)(dcs + payload[i]);
    frame[idx++] = (uint8_t)(~dcs + 1);
    frame[idx++] = PN532_POSTAMBLE;

    esp_err_t err = pn532_write_raw(frame, idx);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "pn532 write failed: %s", esp_err_to_name(err));
        return err;
    }
    return err;
}

static esp_err_t pn532_read_frame(uint8_t *out, size_t out_len, size_t *actual)
{
    uint8_t raw[96] = {0};
    esp_err_t err = pn532_read_raw(raw, sizeof(raw));
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "pn532 read frame failed: %s", esp_err_to_name(err));
        return err;
    }

    if (raw[0] != 0x01) {
        ESP_LOGW(TAG, "Frame status byte not ready: 0x%02X", raw[0]);
    }

    const uint8_t *p = &raw[1];
    if (p[0] != PN532_PREAMBLE || p[1] != PN532_STARTCODE1 || p[2] != PN532_STARTCODE2) {
        pn532_log_bytes("Bad frame header", raw, 12);
        return ESP_ERR_INVALID_RESPONSE;
    }
    uint8_t len = p[3];
    uint8_t lcs = p[4];
    if ((uint8_t)(len + lcs) != 0x00) {
        ESP_LOGW(TAG, "LEN/LCS mismatch len=0x%02X lcs=0x%02X", len, lcs);
        return ESP_ERR_INVALID_CRC;
    }
    if (len < 1) return ESP_ERR_INVALID_RESPONSE;
    if ((size_t)len > out_len) return ESP_ERR_INVALID_SIZE;

    memcpy(out, &p[5], len);
    uint8_t dcs = p[5 + len];
    uint8_t post = p[6 + len];
    if (post != PN532_POSTAMBLE) {
        ESP_LOGW(TAG, "Bad postamble: 0x%02X", post);
        pn532_log_bytes("Frame prefix", raw, 20);
        return ESP_ERR_INVALID_RESPONSE;
    }

    uint8_t sum = 0;
    for (size_t i = 0; i < len; i++) {
        sum = (uint8_t)(sum + out[i]);
    }
    if ((uint8_t)(sum + dcs) != 0x00) {
        ESP_LOGW(TAG, "DCS mismatch sum=0x%02X dcs=0x%02X", sum, dcs);
        pn532_log_bytes("Frame prefix", raw, 24);
        return ESP_ERR_INVALID_CRC;
    }

    *actual = len;
    return ESP_OK;
}

static esp_err_t pn532_exchange(uint8_t cmd, const uint8_t *payload, size_t payload_len, uint8_t *resp, size_t resp_len, size_t *resp_actual)
{
    esp_err_t err = ESP_FAIL;
    for (int attempt = 1; attempt <= PN532_MAX_RETRIES; attempt++) {
        err = pn532_send_command(cmd, payload, payload_len);
        if (err != ESP_OK) {
            ESP_LOGW(TAG, "send cmd failed attempt=%d err=%s", attempt, esp_err_to_name(err));
            continue;
        }

        err = pn532_wait_ready(1000);
        if (err != ESP_OK) {
            ESP_LOGW(TAG, "wait ready(ack) timeout attempt=%d err=%s", attempt, esp_err_to_name(err));
            continue;
        }

        err = pn532_read_ack_frame();
        if (err != ESP_OK) {
            ESP_LOGW(TAG, "ack read failed attempt=%d err=%s", attempt, esp_err_to_name(err));
            continue;
        }

        err = pn532_wait_ready(1000);
        if (err != ESP_OK) {
            ESP_LOGW(TAG, "wait ready(resp) timeout attempt=%d err=%s", attempt, esp_err_to_name(err));
            continue;
        }

        err = pn532_read_frame(resp, resp_len, resp_actual);
        if (err == ESP_OK) return ESP_OK;

        ESP_LOGW(TAG, "response parse failed attempt=%d err=%s", attempt, esp_err_to_name(err));
        vTaskDelay(pdMS_TO_TICKS(50));
    }
    return err;
}

static esp_err_t pn532_get_firmware_version(uint32_t *fw_version)
{
    uint8_t resp[64];
    size_t resp_len = 0;
    esp_err_t err = pn532_exchange(PN532_CMD_GETFIRMWAREVERSION, NULL, 0, resp, sizeof(resp), &resp_len);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "GetFirmwareVersion failed: %s", esp_err_to_name(err));
        return err;
    }
    if (resp_len < 6 || resp[0] != PN532_PN532TOHOST || resp[1] != (PN532_CMD_GETFIRMWAREVERSION + 1)) {
        pn532_log_bytes("GetFirmwareVersion unexpected response", resp, resp_len);
        return ESP_ERR_INVALID_RESPONSE;
    }

    *fw_version = ((uint32_t)resp[2] << 24)
                | ((uint32_t)resp[3] << 16)
                | ((uint32_t)resp[4] << 8)
                | (uint32_t)resp[5];
    ESP_LOGI(TAG, "PN532 firmware IC=0x%02X Ver=%u.%u Support=0x%02X",
             resp[2], (unsigned int)resp[3], (unsigned int)resp[4], resp[5]);
    return ESP_OK;
}

static esp_err_t pn532_sam_config(void)
{
    // Normal mode, timeout 1s, use IRQ pin.
    const uint8_t sam_cfg[] = {0x01, 0x14, 0x01};
    uint8_t resp[64];
    size_t resp_len = 0;
    esp_err_t err = pn532_exchange(PN532_CMD_SAMCONFIGURATION, sam_cfg, sizeof(sam_cfg), resp, sizeof(resp), &resp_len);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "SAM config failed: %s", esp_err_to_name(err));
        return err;
    }
    return err;
}

static esp_err_t pn532_tg_init_as_target(void)
{
    // Minimal Type A target init payload.
    const uint8_t target_params[] = {
        0x00,                         // MODE: passive only
        0x08, 0x00,                   // SENS_RES
        0x12, 0x34, 0x56,             // NFCID1t
        0x20,                         // SEL_RES
        0x00, 0x00, 0x00,             // POL_RES
        0x00, 0x00,                   // NFCID3t length=0
        0x00, 0x00,                   // historical bytes length=0
    };

    uint8_t resp[96];
    size_t resp_len = 0;
    return pn532_exchange(PN532_CMD_TGINITASTARGET, target_params, sizeof(target_params), resp, sizeof(resp), &resp_len);
}

static esp_err_t pn532_tg_get_data(uint8_t *buf, size_t buf_len, size_t *actual)
{
    uint8_t resp[96];
    size_t resp_len = 0;
    esp_err_t err = pn532_exchange(PN532_CMD_TGGETDATA, NULL, 0, resp, sizeof(resp), &resp_len);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "tggetdata failed: %s", esp_err_to_name(err));
        return err;
    }
    if (resp_len < 2 || resp[0] != PN532_PN532TOHOST || resp[1] != (PN532_CMD_TGGETDATA + 1)) {
        return ESP_ERR_INVALID_RESPONSE;
    }
    size_t payload_len = resp_len - 2;
    if (payload_len > buf_len) return ESP_ERR_INVALID_SIZE;
    memcpy(buf, &resp[2], payload_len);
    *actual = payload_len;
    return ESP_OK;
}

static esp_err_t pn532_tg_set_data(const uint8_t *buf, size_t len)
{
    uint8_t resp[64];
    size_t resp_len = 0;
    esp_err_t err = pn532_exchange(PN532_CMD_TGSETDATA, buf, len, resp, sizeof(resp), &resp_len);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "tgsetdata failed: %s", esp_err_to_name(err));
        return err;
    }
    return err;
}

static bool nfc_is_valid_scan_data(const uint8_t *rx, size_t rx_len)
{
    if (!rx || rx_len == 0) return false;

    bool all_zero = true;
    for (size_t i = 0; i < rx_len; i++) {
        if (rx[i] != 0x00) {
            all_zero = false;
            break;
        }
    }
    if (all_zero) return false;

    // PN532 target mode often returns status-only frames when no initiator payload exists.
    if (rx_len == 1) return false;

    // Status + empty marker pattern observed on idle loops.
    if (rx_len == 2 && rx[0] == 0x00 && rx[1] == 0x00) return false;

    return true;
}

static bool nfc_is_duplicate_scan(const uint8_t *rx, size_t rx_len, int64_t now_us)
{
    const int64_t elapsed_ms = (g_last_scan_ts_us == 0) ? INT64_MAX : ((now_us - g_last_scan_ts_us) / 1000);

    size_t fp_len = rx_len;
    if (fp_len > sizeof(g_last_scan_frame)) fp_len = sizeof(g_last_scan_frame);
    bool same_fingerprint = (fp_len == g_last_scan_frame_len) && (memcmp(rx, g_last_scan_frame, fp_len) == 0);

    if (elapsed_ms >= 0 && elapsed_ms < SCAN_DEBOUNCE_MS) return true;
    if (same_fingerprint && elapsed_ms >= 0 && elapsed_ms < SCAN_REPEAT_WINDOW_MS) return true;

    return false;
}

static void nfc_record_scan(const uint8_t *rx, size_t rx_len, int64_t now_us)
{
    g_last_scan_ts_us = now_us;
    g_last_scan_frame_len = rx_len > sizeof(g_last_scan_frame) ? sizeof(g_last_scan_frame) : rx_len;
    memcpy(g_last_scan_frame, rx, g_last_scan_frame_len);
}

static void sensor_task(void *param)
{
    (void)param;

    gpio_config_t io = {
        .pin_bit_mask = (1ULL << DHT_GPIO),
        .mode = GPIO_MODE_INPUT_OUTPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&io);
    gpio_set_level(DHT_GPIO, 1);
    vTaskDelay(pdMS_TO_TICKS(DHT_STARTUP_DELAY_MS));

    while (1) {
        float t = NAN, h = NAN;
        esp_err_t err = ESP_FAIL;
        int last_level = gpio_get_level(DHT_GPIO);
        for (int attempt = 1; attempt <= DHT_READ_RETRIES; attempt++) {
            err = dht22_read(DHT_GPIO, &t, &h);
            if (err == ESP_OK) break;
            last_level = gpio_get_level(DHT_GPIO);
            if (attempt < DHT_READ_RETRIES) vTaskDelay(pdMS_TO_TICKS(DHT_RETRY_DELAY_MS));
        }

        if (err == ESP_OK) {
            update_payload(t, h);
            refresh_ndef_payload();
            ESP_LOGI(TAG, "Sample updated: %s", g_ndef_text);
        } else {
            ESP_LOGW(TAG, "DHT22 read failed after %d retries: %s (line_level=%d gpio=%d)",
                     DHT_READ_RETRIES, esp_err_to_name(err), last_level, (int)DHT_GPIO);
        }
        vTaskDelay(pdMS_TO_TICKS(SAMPLE_PERIOD_MS));
    }
}

static void nfc_task(void *param)
{
    (void)param;
    uint8_t rx[96];
    size_t rx_len = 0;

    while (1) {
        if (pn532_tg_init_as_target() != ESP_OK) {
            ESP_LOGW(TAG, "PN532 target init failed, retrying...");
            vTaskDelay(pdMS_TO_TICKS(500));
            continue;
        }

        ESP_LOGI(TAG, "NFC target armed, waiting for phone scan...");
        if (pn532_tg_get_data(rx, sizeof(rx), &rx_len) != ESP_OK) {
            vTaskDelay(pdMS_TO_TICKS(100));
            continue;
        }

        if (!nfc_is_valid_scan_data(rx, rx_len)) {
            ESP_LOGD(TAG, "Ignoring non-scan TgGetData frame len=%u first=0x%02X",
                     (unsigned int)rx_len, rx_len > 0 ? rx[0] : 0x00);
            continue;
        }

        int64_t now_us = esp_timer_get_time();
        if (nfc_is_duplicate_scan(rx, rx_len, now_us)) {
            ESP_LOGD(TAG, "Ignoring duplicate/debounced scan frame len=%u", (unsigned int)rx_len);
            continue;
        }
        nfc_record_scan(rx, rx_len, now_us);

        refresh_ndef_payload();
        ESP_LOGI(TAG, "Phone scan detected, sending payload: %s", g_ndef_text);
        (void)pn532_tg_set_data((const uint8_t *)g_ndef_text, strlen(g_ndef_text));
    }
}

void app_main(void)
{
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        nvs_flash_erase();
        nvs_flash_init();
    }

    g_lock = xSemaphoreCreateMutex();
    if (!g_lock) {
        ESP_LOGE(TAG, "Failed to create mutex");
        return;
    }

    memset(&g_payload, 0, sizeof(g_payload));
    refresh_ndef_payload();

    ESP_LOGI(TAG, "BLE transport disabled (commented out). Starting PN532 NFC mode.");
    ESP_LOGI(TAG, "PN532 checklist: board in I2C mode, SDA/SCL pull-ups present, common GND.");
    ESP_LOGI(TAG, "PN532 config addr=0x%02X sda=%d scl=%d freq=%lu",
             g_pn532_addr, (int)PN532_I2C_SDA_GPIO, (int)PN532_I2C_SCL_GPIO, (unsigned long)g_i2c_clk_hz);

    pn532_log_i2c_line_levels("pre-init");
    ESP_ERROR_CHECK(pn532_i2c_init());

    uint8_t found_addrs[16] = {0};
    int found_count = pn532_scan_i2c_bus(found_addrs, sizeof(found_addrs));
    if (found_count == 0 && g_i2c_clk_hz != PN532_FALLBACK_I2C_HZ) {
        ESP_LOGW(TAG, "No ACK at %lu Hz. Retrying scan at fallback %d Hz.",
                 (unsigned long)g_i2c_clk_hz, PN532_FALLBACK_I2C_HZ);
        g_i2c_clk_hz = PN532_FALLBACK_I2C_HZ;
        ESP_ERROR_CHECK(pn532_i2c_init());
        found_count = pn532_scan_i2c_bus(found_addrs, sizeof(found_addrs));
    }
    if (found_count > 0) {
        bool configured_found = false;
        for (int i = 0; i < found_count && i < (int)sizeof(found_addrs); i++) {
            if (found_addrs[i] == g_pn532_addr) {
                configured_found = true;
                break;
            }
        }
        if (!configured_found && found_count == 1) {
            g_pn532_addr = found_addrs[0];
            ESP_LOGW(TAG, "Configured addr not found; auto-selecting sole ACK address 0x%02X", g_pn532_addr);
        } else if (!configured_found) {
            ESP_LOGW(TAG, "Configured addr 0x%02X not detected. Check PN532_I2C_ADDR_7BIT.", g_pn532_addr);
        }
    }

    esp_err_t probe = pn532_probe_device();
    if (probe != ESP_OK) {
        ESP_LOGW(TAG, "PN532 probe did not ACK on 0x%02X: %s", g_pn532_addr, esp_err_to_name(probe));
    } else {
        ESP_LOGI(TAG, "PN532 probe ACK received on 0x%02X", g_pn532_addr);
    }

    while (1) {
        uint32_t fw = 0;
        esp_err_t fw_err = pn532_get_firmware_version(&fw);
        if (fw_err == ESP_OK) {
            ESP_LOGI(TAG, "PN532 firmware query successful: 0x%08lX", (unsigned long)fw);
            break;
        }
        pn532_log_i2c_line_levels("fw-retry");
        ESP_LOGW(TAG, "Firmware query failed (%s), retrying in %d ms",
                 esp_err_to_name(fw_err), PN532_INIT_RETRY_DELAY_MS);
        vTaskDelay(pdMS_TO_TICKS(PN532_INIT_RETRY_DELAY_MS));
    }

    while (1) {
        esp_err_t sam_err = pn532_sam_config();
        if (sam_err == ESP_OK) break;
        pn532_log_i2c_line_levels("sam-retry");
        ESP_LOGW(TAG, "SAM config failed (%s), retrying in %d ms",
                 esp_err_to_name(sam_err), PN532_INIT_RETRY_DELAY_MS);
        vTaskDelay(pdMS_TO_TICKS(PN532_INIT_RETRY_DELAY_MS));
    }
    ESP_LOGI(TAG, "PN532 SAM config successful");

    xTaskCreate(sensor_task, "sensor", 4096, NULL, 5, NULL);
    xTaskCreate(nfc_task, "nfc", 6144, NULL, 5, NULL);
}

#if 0 // BLE_DISABLED_TEMP_REMAINDER
static uint8_t compute_flag(float t, float h)
{
    if (t < TEMP_MIN_ALLOWED_C || t > TEMP_MAX_ALLOWED_C) return FLAG_TEMP_OOR;
    if (h < HUMI_MIN_ALLOWED_PCT || h > HUMI_MAX_ALLOWED_PCT) return FLAG_HUMI_OOR;
    return FLAG_OK;
}

static void hist_push(float t, float h, uint8_t flag2)
{
    uint32_t ts_s = (uint32_t)(esp_timer_get_time() / 1000000ULL);

    rec_t r;
    r.ts_s = ts_s;
    r.temp_c = t;
    r.humi_pct = h;
    r.flag2 = flag2;
    r.seq = g_seq++;

    g_hist[g_hist_head] = r;
    g_hist_head = (uint16_t)((g_hist_head + 1) % HISTORY_MAX);
    if (g_hist_count < HISTORY_MAX) g_hist_count++;
}

static void update_payload(float t, float h)
{
    xSemaphoreTake(g_lock, portMAX_DELAY);

    uint8_t flag = compute_flag(t, h);

    if (!g_initialized) {
        g_payload.temp_min = t;
        g_payload.temp_max = t;
        g_payload.humi_min = h;
        g_payload.humi_max = h;
        g_initialized = true;
    } else {
        if (t < g_payload.temp_min) g_payload.temp_min = t;
        if (t > g_payload.temp_max) g_payload.temp_max = t;
        if (h < g_payload.humi_min) g_payload.humi_min = h;
        if (h > g_payload.humi_max) g_payload.humi_max = h;
    }

    g_payload.flag2 = flag;
    hist_push(t, h, flag);

    xSemaphoreGive(g_lock);
}

static void set_active_batch(uint32_t batch_id)
{
    xSemaphoreTake(g_lock, portMAX_DELAY);
    g_has_active_batch = true;
    g_active_batch_id = batch_id;
    g_payload.has_batch = 1;
    g_payload.batch_id = batch_id;
    g_payload.temp_min = 0.0f;
    g_payload.temp_max = 0.0f;
    g_payload.humi_min = 0.0f;
    g_payload.humi_max = 0.0f;
    g_payload.flag2 = FLAG_OK;
    g_initialized = false;
    xSemaphoreGive(g_lock);
}

static void clear_active_batch(void)
{
    xSemaphoreTake(g_lock, portMAX_DELAY);
    g_has_active_batch = false;
    g_active_batch_id = 0;
    g_payload.has_batch = 0;
    g_payload.batch_id = 0;
    g_payload.temp_min = 0.0f;
    g_payload.temp_max = 0.0f;
    g_payload.humi_min = 0.0f;
    g_payload.humi_max = 0.0f;
    g_payload.flag2 = FLAG_OK;
    g_initialized = false;
    xSemaphoreGive(g_lock);
}

static bool conn_is_encrypted(uint16_t conn_handle)
{
    struct ble_gap_conn_desc desc;
    if (ble_gap_conn_find(conn_handle, &desc) != 0) return false;
    return desc.sec_state.encrypted;
}

static void notify_payload(void)
{
    if (g_conn_handle == BLE_HS_CONN_HANDLE_NONE) return;
    if (!g_sub_payload) return;
    if (!conn_is_encrypted(g_conn_handle)) return;

    payload_t snap;
    xSemaphoreTake(g_lock, portMAX_DELAY);
    snap = g_payload;
    xSemaphoreGive(g_lock);

    struct os_mbuf *om = ble_hs_mbuf_from_flat(&snap, sizeof(snap));
    if (!om) return;
    ble_gatts_notify_custom(g_conn_handle, g_attr_handle_payload, om);
}

static void hist_clear(void)
{
    xSemaphoreTake(g_lock, portMAX_DELAY);
    g_hist_head = 0;
    g_hist_count = 0;
    xSemaphoreGive(g_lock);
}

static uint16_t hist_get_count(void)
{
    uint16_t c;
    xSemaphoreTake(g_lock, portMAX_DELAY);
    c = g_hist_count;
    xSemaphoreGive(g_lock);
    return c;
}

static rec_t hist_get_at_oldest(uint16_t idx)
{
    rec_t r;
    xSemaphoreTake(g_lock, portMAX_DELAY);
    uint16_t count = g_hist_count;
    if (idx >= count) {
        memset(&r, 0, sizeof(r));
    } else {
        uint16_t start = (uint16_t)((g_hist_head + HISTORY_MAX - count) % HISTORY_MAX);
        uint16_t pos = (uint16_t)((start + idx) % HISTORY_MAX);
        r = g_hist[pos];
    }
    xSemaphoreGive(g_lock);
    return r;
}

static void history_stream_task(void *param)
{
    (void)param;

    while (1) {
        if (!g_stream_req_start) {
            vTaskDelay(pdMS_TO_TICKS(50));
            continue;
        }

        g_stream_req_start = false;
        g_stream_req_stop = false;

        if (g_conn_handle == BLE_HS_CONN_HANDLE_NONE) continue;
        if (!g_sub_hist) continue;
        if (!conn_is_encrypted(g_conn_handle)) continue;

        g_streaming = true;

        uint16_t count = hist_get_count();
        for (uint16_t i = 0; i < count; i++) {
            if (g_stream_req_stop) break;
            if (g_conn_handle == BLE_HS_CONN_HANDLE_NONE) break;
            if (!g_sub_hist) break;
            if (!conn_is_encrypted(g_conn_handle)) break;

            rec_t r = hist_get_at_oldest(i);

            struct os_mbuf *om = ble_hs_mbuf_from_flat(&r, sizeof(r));
            if (!om) break;

            int rc = ble_gatts_notify_custom(g_conn_handle, g_attr_handle_hist, om);
            if (rc != 0) break;

            vTaskDelay(pdMS_TO_TICKS(20));
        }

        g_streaming = false;
        g_stream_req_stop = false;
    }
}

static int gatt_access_cb(uint16_t conn_handle, uint16_t attr_handle,
                          struct ble_gatt_access_ctxt *ctxt, void *arg)
{
    (void)arg;

    if (!conn_is_encrypted(conn_handle)) return BLE_ATT_ERR_INSUFFICIENT_ENC;

    if (attr_handle == g_attr_handle_payload) {
        if (ctxt->op == BLE_GATT_ACCESS_OP_READ_CHR) {
            payload_t snap;
            int rc;
            xSemaphoreTake(g_lock, portMAX_DELAY);
            snap = g_payload;
            rc = os_mbuf_append(ctxt->om, &snap, sizeof(snap));
            if (rc == 0) {
                g_payload.temp_min = 0.0f;
                g_payload.temp_max = 0.0f;
                g_payload.humi_min = 0.0f;
                g_payload.humi_max = 0.0f;
                g_payload.flag2 = FLAG_OK;
                g_initialized = false;
            }
            xSemaphoreGive(g_lock);
            return rc == 0 ? 0 : BLE_ATT_ERR_INSUFFICIENT_RES;
        }
        return BLE_ATT_ERR_UNLIKELY;
    }

    if (attr_handle == g_attr_handle_ctrl) {
        if (ctxt->op == BLE_GATT_ACCESS_OP_WRITE_CHR) {
            uint8_t cmd = 0;
            uint16_t len = OS_MBUF_PKTLEN(ctxt->om);
            if (len < 1) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
            if (os_mbuf_copydata(ctxt->om, 0, 1, &cmd) != 0) return BLE_ATT_ERR_UNLIKELY;

            if (cmd == CTRL_CMD_STREAM_START) {
                g_stream_req_start = true;
                return 0;
            }
            if (cmd == CTRL_CMD_STREAM_STOP) {
                g_stream_req_stop = true;
                return 0;
            }
            if (cmd == CTRL_CMD_HISTORY_CLEAR) {
                hist_clear();
                return 0;
            }
            if (cmd == CTRL_CMD_SET_ACTIVE_BATCH) {
                if (len < 5) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
                uint8_t raw[4] = {0};
                if (os_mbuf_copydata(ctxt->om, 1, 4, raw) != 0) return BLE_ATT_ERR_UNLIKELY;
                uint32_t batch_id = (uint32_t)raw[0]
                                  | ((uint32_t)raw[1] << 8)
                                  | ((uint32_t)raw[2] << 16)
                                  | ((uint32_t)raw[3] << 24);
                if (batch_id == 0) return BLE_ATT_ERR_UNLIKELY;
                set_active_batch(batch_id);
                ESP_LOGI(TAG, "Active batch set: %lu", (unsigned long)batch_id);
                return 0;
            }
            if (cmd == CTRL_CMD_CLEAR_ACTIVE_BATCH) {
                clear_active_batch();
                ESP_LOGI(TAG, "Active batch cleared.");
                return 0;
            }
            return BLE_ATT_ERR_UNLIKELY;
        }
        return BLE_ATT_ERR_UNLIKELY;
    }

    if (attr_handle == g_attr_handle_hist) {
        return BLE_ATT_ERR_UNLIKELY;
    }

    return BLE_ATT_ERR_UNLIKELY;
}

static const struct ble_gatt_svc_def gatt_svcs[] = {
    {
        .type = BLE_GATT_SVC_TYPE_PRIMARY,
        .uuid = &g_svc_uuid.u,
        .characteristics = (struct ble_gatt_chr_def[]){
            {
                .uuid = &g_chr_uuid_payload.u,
                .access_cb = gatt_access_cb,
                .val_handle = &g_attr_handle_payload,
                .flags = BLE_GATT_CHR_F_READ | BLE_GATT_CHR_F_NOTIFY,
            },
            {
                .uuid = &g_chr_uuid_ctrl.u,
                .access_cb = gatt_access_cb,
                .val_handle = &g_attr_handle_ctrl,
                .flags = BLE_GATT_CHR_F_WRITE,
            },
            {
                .uuid = &g_chr_uuid_hist.u,
                .access_cb = gatt_access_cb,
                .val_handle = &g_attr_handle_hist,
                .flags = BLE_GATT_CHR_F_NOTIFY,
            },
            {0}
        },
    },
    {0},
};

static void adv_start(void);

static int gap_event_cb(struct ble_gap_event *event, void *arg)
{
    (void)arg;

    switch (event->type) {
    case BLE_GAP_EVENT_CONNECT:
        ESP_LOGI(TAG, "GAP connect event status=%d", event->connect.status);
        if (event->connect.status == 0) {
            g_conn_handle = event->connect.conn_handle;
            g_sub_payload = false;
            g_sub_hist = false;
            ESP_LOGI(TAG, "Connected: conn_handle=%d. Initiating security.", g_conn_handle);
            ble_gap_security_initiate(g_conn_handle);
        } else {
            g_conn_handle = BLE_HS_CONN_HANDLE_NONE;
            ESP_LOGW(TAG, "Connection failed, restarting advertising.");
            adv_start();
        }
        return 0;

    case BLE_GAP_EVENT_DISCONNECT:
        ESP_LOGI(TAG, "Disconnected: conn_handle=%d reason=%d", event->disconnect.conn.conn_handle, event->disconnect.reason);
        g_conn_handle = BLE_HS_CONN_HANDLE_NONE;
        g_sub_payload = false;
        g_sub_hist = false;
        g_stream_req_stop = true;
        adv_start();
        return 0;

    case BLE_GAP_EVENT_ADV_COMPLETE:
        adv_start();
        return 0;

    case BLE_GAP_EVENT_SUBSCRIBE:
        ESP_LOGI(TAG, "Subscribe event attr_handle=%d cur_notify=%d", event->subscribe.attr_handle, event->subscribe.cur_notify);
        if (event->subscribe.attr_handle == g_attr_handle_payload) {
            g_sub_payload = event->subscribe.cur_notify;
        } else if (event->subscribe.attr_handle == g_attr_handle_hist) {
            g_sub_hist = event->subscribe.cur_notify;
        }
        return 0;

    case BLE_GAP_EVENT_ENC_CHANGE:
        ESP_LOGI(TAG, "Encryption change status=%d encrypted=%d", event->enc_change.status, conn_is_encrypted(event->enc_change.conn_handle));
        if (event->enc_change.status == 0) {
            notify_payload();
        }
        return 0;

    default:
        return 0;
    }
}

static void adv_start(void)
{
    struct ble_gap_adv_params advp;
    struct ble_hs_adv_fields adv_fields;
    struct ble_hs_adv_fields rsp_fields;
    const char *name = ble_svc_gap_device_name();
    int rc;

    memset(&adv_fields, 0, sizeof(adv_fields));
    adv_fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
    adv_fields.uuids128 = (const ble_uuid128_t *)&g_svc_uuid;
    adv_fields.num_uuids128 = 1;
    adv_fields.uuids128_is_complete = 1;

    rc = ble_gap_adv_set_fields(&adv_fields);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_gap_adv_set_fields failed rc=%d", rc);
        return;
    }

    memset(&rsp_fields, 0, sizeof(rsp_fields));
    rsp_fields.name = (uint8_t *)name;
    rsp_fields.name_len = (uint8_t)strlen(name);
    rsp_fields.name_is_complete = 1;

    rc = ble_gap_adv_rsp_set_fields(&rsp_fields);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_gap_adv_rsp_set_fields failed rc=%d", rc);
        return;
    }

    memset(&advp, 0, sizeof(advp));
    advp.conn_mode = BLE_GAP_CONN_MODE_UND;
    advp.disc_mode = BLE_GAP_DISC_MODE_GEN;

    rc = ble_gap_adv_start(g_own_addr_type, NULL, BLE_HS_FOREVER, &advp, gap_event_cb, NULL);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_gap_adv_start failed rc=%d", rc);
        return;
    }
    ESP_LOGI(TAG, "Advertising started successfully as %s", name);
}

static void on_sync(void)
{
    int rc = ble_hs_id_infer_auto(0, &g_own_addr_type);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_hs_id_infer_auto failed rc=%d", rc);
        return;
    }
    ESP_LOGI(TAG, "BLE synced. own_addr_type=%d", g_own_addr_type);
    ESP_LOGI(TAG, "Service UUID: %s", BLE_SERVICE_UUID_STR);
    ESP_LOGI(TAG, "Characteristic UUIDs: payload=%s ctrl=%s hist=%s",
             BLE_CHAR_PAYLOAD_UUID_STR, BLE_CHAR_CTRL_UUID_STR, BLE_CHAR_HIST_UUID_STR);
    adv_start();
}

static void host_task(void *param)
{
    (void)param;
    nimble_port_run();
    nimble_port_freertos_deinit();
}

static void sensor_task(void *param)
{
    (void)param;

    gpio_config_t io = {
        .pin_bit_mask = (1ULL << DHT_GPIO),
        .mode = GPIO_MODE_INPUT_OUTPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&io);
    gpio_set_level(DHT_GPIO, 1);
    vTaskDelay(pdMS_TO_TICKS(DHT_STARTUP_DELAY_MS));

    while (1) {
        bool has_batch = false;
        xSemaphoreTake(g_lock, portMAX_DELAY);
        has_batch = g_has_active_batch;
        xSemaphoreGive(g_lock);
        if (!has_batch) {
            vTaskDelay(pdMS_TO_TICKS(SAMPLE_PERIOD_MS));
            continue;
        }

        float t = NAN, h = NAN;
        esp_err_t err = ESP_FAIL;
        int last_level = gpio_get_level(DHT_GPIO);
        for (int attempt = 1; attempt <= DHT_READ_RETRIES; attempt++) {
            err = dht22_read(DHT_GPIO, &t, &h);
            if (err == ESP_OK) {
                break;
            }
            last_level = gpio_get_level(DHT_GPIO);
            if (attempt < DHT_READ_RETRIES) {
                vTaskDelay(pdMS_TO_TICKS(DHT_RETRY_DELAY_MS));
            }
        }
        if (err == ESP_OK) {
            update_payload(t, h);
            notify_payload();

            payload_t snap;
            xSemaphoreTake(g_lock, portMAX_DELAY);
            snap = g_payload;
            xSemaphoreGive(g_lock);

            ESP_LOGI(TAG,
                     "Sample t=%.2fC h=%.2f%% | minmax t=[%.2f, %.2f] h=[%.2f, %.2f] flag=0x%02X",
                     t, h,
                     snap.temp_min, snap.temp_max,
                     snap.humi_min, snap.humi_max,
                     snap.flag2);
        } else {
            ESP_LOGW(TAG, "DHT22 read failed after %d retries: %s (line_level=%d gpio=%d)",
                     DHT_READ_RETRIES, esp_err_to_name(err), last_level, (int)DHT_GPIO);
        }
        vTaskDelay(pdMS_TO_TICKS(SAMPLE_PERIOD_MS));
    }
}

void app_main(void)
{
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        nvs_flash_erase();
        nvs_flash_init();
    }

    g_lock = xSemaphoreCreateMutex();

#if MANUAL_MODE
    xSemaphoreTake(g_lock, portMAX_DELAY);
    g_payload.temp_min = MAN_TEMP_MIN;
    g_payload.temp_max = MAN_TEMP_MAX;
    g_payload.humi_min = MAN_HUMI_MIN;
    g_payload.humi_max = MAN_HUMI_MAX;
    g_payload.flag2    = (uint8_t)MAN_FLAG;
    g_payload.has_batch = 0;
    g_payload.batch_id = 0;
    g_initialized = true;
    hist_push((MAN_TEMP_MIN + MAN_TEMP_MAX) * 0.5f, (MAN_HUMI_MIN + MAN_HUMI_MAX) * 0.5f, (uint8_t)MAN_FLAG);
    xSemaphoreGive(g_lock);
#else
    g_payload.temp_min = 0.0f;
    g_payload.temp_max = 0.0f;
    g_payload.humi_min = 0.0f;
    g_payload.humi_max = 0.0f;
    g_payload.flag2 = FLAG_OK;
    g_payload.has_batch = 0;
    g_payload.batch_id = 0;
#endif

    nimble_port_init();

    ble_hs_cfg.sync_cb = on_sync;

    ble_hs_cfg.sm_bonding = 1;
    ble_hs_cfg.sm_mitm = 0;
    ble_hs_cfg.sm_sc = 1;
    ble_hs_cfg.sm_io_cap = BLE_HS_IO_NO_INPUT_OUTPUT;
    ble_hs_cfg.sm_our_key_dist = BLE_SM_PAIR_KEY_DIST_ENC | BLE_SM_PAIR_KEY_DIST_ID;
    ble_hs_cfg.sm_their_key_dist = BLE_SM_PAIR_KEY_DIST_ENC | BLE_SM_PAIR_KEY_DIST_ID;

    ble_svc_gap_init();
    ble_svc_gatt_init();

    int rc = ble_gatts_count_cfg(gatt_svcs);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_gatts_count_cfg failed rc=%d", rc);
        return;
    }
    rc = ble_gatts_add_svcs(gatt_svcs);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_gatts_add_svcs failed rc=%d", rc);
        return;
    }

    ble_svc_gap_device_name_set("ESP32H2-DHT");

    nimble_port_freertos_init(host_task);

    xTaskCreate(history_stream_task, "hist_stream", 4096, NULL, 5, NULL);

#if !MANUAL_MODE
    xTaskCreate(sensor_task, "sensor", 4096, NULL, 5, NULL);
#endif
}
#endif // BLE_DISABLED_TEMP_REMAINDER