//#if 0 // BLE_DISABLED_TEMP
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
//#endif // BLE_DISABLED_TEMP

// #include <stdio.h>
// #include <string.h>
// #include <math.h>
// #include <stdint.h>
// #include <stdbool.h>

// #include "freertos/FreeRTOS.h"
// #include "freertos/task.h"
// #include "freertos/semphr.h"

// #include "nvs_flash.h"
// #include "esp_log.h"
// #include "esp_err.h"
// #include "esp_timer.h"
// #include "esp_rom_sys.h"

// #include "driver/gpio.h"
// #include "driver/i2c.h"
// #include "dht.h"

// #define DHT_GPIO              GPIO_NUM_4
// #define SAMPLE_PERIOD_MS      3000
// #define DHT_STARTUP_DELAY_MS  2000
// #define DHT_READ_RETRIES      3
// #define DHT_RETRY_DELAY_MS    30

// #define TEMP_MIN_ALLOWED_C    (10.0f)
// #define TEMP_MAX_ALLOWED_C    (30.0f)
// #define HUMI_MIN_ALLOWED_PCT  (5.0f)
// #define HUMI_MAX_ALLOWED_PCT  (50.0f)

// #define FLAG_OK        0x0
// #define FLAG_TEMP_OOR  0x1
// #define FLAG_HUMI_OOR  0x2

// #define PN532_I2C_PORT        I2C_NUM_0
// #define PN532_I2C_SDA_GPIO    GPIO_NUM_8
// #define PN532_I2C_SCL_GPIO    GPIO_NUM_9
// #define PN532_I2C_FREQ_HZ     20000
// #define PN532_I2C_ADDR_7BIT   0x24

// #define PN532_PREAMBLE        0x00
// #define PN532_STARTCODE1      0x00
// #define PN532_STARTCODE2      0xFF
// #define PN532_POSTAMBLE       0x00
// #define PN532_HOSTTOPN532     0xD4
// #define PN532_PN532TOHOST     0xD5

// #define PN532_CMD_SAMCONFIGURATION 0x14
// #define PN532_CMD_GETFIRMWAREVERSION 0x02
// #define PN532_CMD_INLISTPASSIVETARGET 0x4A
// #define PN532_CMD_INDATAEXCHANGE    0x40
// #define PN532_CMD_TGINITASTARGET   0x8C
// #define PN532_CMD_TGGETDATA        0x86
// #define PN532_CMD_TGSETDATA        0x8E

// #define MIFARE_CMD_AUTH_A          0x60
// #define MIFARE_CMD_READ            0x30
// #define MIFARE_CMD_WRITE           0xA0
// #define MIFARE_CLASSIC_UID_LEN     4

// #define PN532_ACK_FRAME_LEN        6
// #define PN532_MAX_RETRIES          3
// #define PN532_INIT_RETRY_DELAY_MS  2000
// #define PN532_FALLBACK_I2C_HZ      50000
// #define PN532_ACK_WAIT_MS          1200
// #define PN532_RESP_WAIT_MS         1500
// #define PN532_RESP_WAIT_TARGET_MS  6000
// #define PN532_RESP_WAIT_GETDATA_MS 8000
// #define PN532_RUNTIME_RECOVER_RETRIES 3
// #define SCAN_DEBOUNCE_MS           500
// #define SCAN_REPEAT_WINDOW_MS      1500
// #define NFC_DEBUG_VERBOSE          1
// #define NDEF_LANG_CODE             "en"
// #define NDEF_MSG_MAX_LEN           240
// #define T4T_NDEF_FILE_MAX_LEN      (NDEF_MSG_MAX_LEN + 2)
// #define T4T_CC_FILE_LEN            15
// #define T4T_FILE_ID_NONE           0x0000
// #define T4T_FILE_ID_CC             0xE103
// #define T4T_FILE_ID_NDEF           0xE104

// static const char *TAG = "PN532_DHT22";
// static const uint8_t PN532_ACK_FRAME[PN532_ACK_FRAME_LEN] = {0x00, 0x00, 0xFF, 0x00, 0xFF, 0x00};
// static uint8_t g_pn532_addr = PN532_I2C_ADDR_7BIT;
// static uint32_t g_i2c_clk_hz = PN532_I2C_FREQ_HZ;

// typedef struct __attribute__((packed)) {
//     float temp_min;
//     float temp_max;
//     float humi_min;
//     float humi_max;
//     uint8_t flag2;
//     uint8_t has_batch;
//     uint32_t batch_id;
//     float latest_temp_c;
//     float latest_humi_pct;
//     uint32_t updated_ts_s;
// } payload_t;

// static payload_t g_payload;
// static bool g_initialized = false;
// static SemaphoreHandle_t g_lock;
// static char g_ndef_text[196];
// static char g_ndef_uri[220];
// static uint8_t g_ndef_msg[NDEF_MSG_MAX_LEN];
// static size_t g_ndef_msg_len = 0;
// static uint8_t g_t4t_ndef_file[T4T_NDEF_FILE_MAX_LEN];
// static size_t g_t4t_ndef_file_len = 2;
// static uint16_t g_t4t_selected_file = T4T_FILE_ID_NONE;
// static int64_t g_last_scan_ts_us = 0;
// static uint8_t g_last_scan_frame[16];
// static size_t g_last_scan_frame_len = 0;

// static const uint8_t g_t4t_cc_file[T4T_CC_FILE_LEN] = {
//     0x00, 0x0F, // CCLEN
//     0x20,       // Mapping version 2.0
//     0x00, 0x3B, // MLe
//     0x00, 0x34, // MLc
//     0x04,       // NDEF File Control TLV tag
//     0x06,       // TLV length
//     0xE1, 0x04, // NDEF file ID
//     0x00, 0xFA, // Max NDEF size (250 bytes)
//     0x00,       // Read access granted
//     0xFF        // Write access denied
// };

// static uint8_t compute_flag(float t, float h)
// {
//     if (t < TEMP_MIN_ALLOWED_C || t > TEMP_MAX_ALLOWED_C) return FLAG_TEMP_OOR;
//     if (h < HUMI_MIN_ALLOWED_PCT || h > HUMI_MAX_ALLOWED_PCT) return FLAG_HUMI_OOR;
//     return FLAG_OK;
// }

// static esp_err_t dht22_read(gpio_num_t pin, float *temp_c, float *humi_pct)
// {
//     float h = NAN;
//     float t = NAN;

//     esp_err_t rc = dht_read_float_data(DHT_TYPE_AM2301, pin, &h, &t);
//     if (rc != ESP_OK) return rc;

//     if (fabsf(t) < 0.001f && fabsf(h) < 0.001f) return ESP_ERR_INVALID_RESPONSE;

//     *temp_c = t;
//     *humi_pct = h;
//     return ESP_OK;
// }

// static void update_payload(float t, float h)
// {
//     uint8_t flag = compute_flag(t, h);
//     uint32_t ts_s = (uint32_t)(esp_timer_get_time() / 1000000ULL);

//     xSemaphoreTake(g_lock, portMAX_DELAY);
//     if (!g_initialized) {
//         g_payload.temp_min = t;
//         g_payload.temp_max = t;
//         g_payload.humi_min = h;
//         g_payload.humi_max = h;
//         g_initialized = true;
//     } else {
//         if (t < g_payload.temp_min) g_payload.temp_min = t;
//         if (t > g_payload.temp_max) g_payload.temp_max = t;
//         if (h < g_payload.humi_min) g_payload.humi_min = h;
//         if (h > g_payload.humi_max) g_payload.humi_max = h;
//     }

//     g_payload.flag2 = flag;
//     g_payload.latest_temp_c = t;
//     g_payload.latest_humi_pct = h;
//     g_payload.updated_ts_s = ts_s;
//     xSemaphoreGive(g_lock);
// }

// static size_t ndef_build_text_message(const char *text, uint8_t *out, size_t out_cap)
// {
//     const char *safe_text = text ? text : "";
//     const uint8_t *lang = (const uint8_t *)NDEF_LANG_CODE;
//     const size_t lang_len = strlen(NDEF_LANG_CODE);
//     const size_t text_len = strlen(safe_text);
//     const size_t payload_len = 1 + lang_len + text_len; // status + lang + text

//     if (lang_len > 63) return 0;
//     if (payload_len > 255) return 0; // short record
//     if (out_cap < (size_t)(3 + 1 + payload_len)) return 0;

//     size_t idx = 0;
//     out[idx++] = 0xD1; // MB=1, ME=1, SR=1, TNF=well-known
//     out[idx++] = 0x01; // Type length
//     out[idx++] = (uint8_t)payload_len;
//     out[idx++] = 'T';  // RTD Text
//     out[idx++] = (uint8_t)lang_len; // UTF-8 + language length
//     memcpy(&out[idx], lang, lang_len);
//     idx += lang_len;
//     memcpy(&out[idx], safe_text, text_len);
//     idx += text_len;
//     return idx;
// }

// static size_t ndef_build_uri_message(const char *uri, uint8_t *out, size_t out_cap)
// {
//     const char *safe_uri = uri ? uri : "";
//     const char *prefix = "https://";
//     uint8_t prefix_code = 0x00;
//     const char *suffix = safe_uri;

//     if (strncmp(safe_uri, prefix, strlen(prefix)) == 0) {
//         prefix_code = 0x04; // "https://"
//         suffix = safe_uri + strlen(prefix);
//     }

//     const size_t suffix_len = strlen(suffix);
//     const size_t payload_len = 1 + suffix_len; // URI identifier code + URI text
//     if (payload_len > 255) return 0; // short record
//     if (out_cap < (size_t)(3 + 1 + payload_len)) return 0;

//     size_t idx = 0;
//     out[idx++] = 0xD1; // MB=1, ME=1, SR=1, TNF=well-known
//     out[idx++] = 0x01; // Type length
//     out[idx++] = (uint8_t)payload_len;
//     out[idx++] = 'U';  // RTD URI
//     out[idx++] = prefix_code;
//     memcpy(&out[idx], suffix, suffix_len);
//     idx += suffix_len;
//     return idx;
// }

// static void ndef_refresh_buffers_from_text(const char *text)
// {
//     g_ndef_msg_len = ndef_build_text_message(text, g_ndef_msg, sizeof(g_ndef_msg));
//     if (g_ndef_msg_len == 0) {
//         g_t4t_ndef_file[0] = 0x00;
//         g_t4t_ndef_file[1] = 0x00;
//         g_t4t_ndef_file_len = 2;
//         return;
//     }

//     const uint16_t nlen = (uint16_t)g_ndef_msg_len;
//     g_t4t_ndef_file[0] = (uint8_t)(nlen >> 8);
//     g_t4t_ndef_file[1] = (uint8_t)(nlen & 0xFF);
//     memcpy(&g_t4t_ndef_file[2], g_ndef_msg, g_ndef_msg_len);
//     g_t4t_ndef_file_len = g_ndef_msg_len + 2;
// }

// static void refresh_ndef_payload(void)
// {
//     payload_t snap;
//     xSemaphoreTake(g_lock, portMAX_DELAY);
//     snap = g_payload;
//     xSemaphoreGive(g_lock);

//     snprintf(
//         g_ndef_text,
//         sizeof(g_ndef_text),
//         "temp_c=%.2f;humi_pct=%.2f;flag=%u;batch_id=%lu;ts=%lu",
//         snap.latest_temp_c,
//         snap.latest_humi_pct,
//         (unsigned int)snap.flag2,
//         (unsigned long)snap.batch_id,
//         (unsigned long)snap.updated_ts_s
//     );

//     snprintf(
//         g_ndef_uri,
//         sizeof(g_ndef_uri),
//         "https://supply-chain.local/nfc?temp_c=%.2f&humi_pct=%.2f&flag=%u&batch_id=%lu&ts=%lu",
//         snap.latest_temp_c,
//         snap.latest_humi_pct,
//         (unsigned int)snap.flag2,
//         (unsigned long)snap.batch_id,
//         (unsigned long)snap.updated_ts_s
//     );

//     g_ndef_msg_len = ndef_build_uri_message(g_ndef_uri, g_ndef_msg, sizeof(g_ndef_msg));
//     if (g_ndef_msg_len == 0) {
//         ndef_refresh_buffers_from_text(g_ndef_text);
//     } else {
//         const uint16_t nlen = (uint16_t)g_ndef_msg_len;
//         g_t4t_ndef_file[0] = (uint8_t)(nlen >> 8);
//         g_t4t_ndef_file[1] = (uint8_t)(nlen & 0xFF);
//         memcpy(&g_t4t_ndef_file[2], g_ndef_msg, g_ndef_msg_len);
//         g_t4t_ndef_file_len = g_ndef_msg_len + 2;
//     }
// }

// static void pn532_i2c_bus_unwedge(void)
// {
//     // Force manual clocks on SCL to release a stuck slave and then generate a STOP.
//     (void)i2c_driver_delete(PN532_I2C_PORT);

//     gpio_config_t io = {
//         .pin_bit_mask = (1ULL << PN532_I2C_SCL_GPIO) | (1ULL << PN532_I2C_SDA_GPIO),
//         .mode = GPIO_MODE_OUTPUT_OD,
//         .pull_up_en = GPIO_PULLUP_ENABLE,
//         .pull_down_en = GPIO_PULLDOWN_DISABLE,
//         .intr_type = GPIO_INTR_DISABLE,
//     };
//     (void)gpio_config(&io);

//     gpio_set_level(PN532_I2C_SDA_GPIO, 1);
//     gpio_set_level(PN532_I2C_SCL_GPIO, 1);
//     esp_rom_delay_us(8);

//     for (int i = 0; i < 16; i++) {
//         gpio_set_level(PN532_I2C_SCL_GPIO, 0);
//         esp_rom_delay_us(6);
//         gpio_set_level(PN532_I2C_SCL_GPIO, 1);
//         esp_rom_delay_us(6);
//     }

//     // STOP: SDA low while SCL high, then SDA high.
//     gpio_set_level(PN532_I2C_SDA_GPIO, 0);
//     esp_rom_delay_us(6);
//     gpio_set_level(PN532_I2C_SCL_GPIO, 1);
//     esp_rom_delay_us(6);
//     gpio_set_level(PN532_I2C_SDA_GPIO, 1);
//     esp_rom_delay_us(6);

//     gpio_set_direction(PN532_I2C_SCL_GPIO, GPIO_MODE_INPUT_OUTPUT_OD);
//     gpio_set_direction(PN532_I2C_SDA_GPIO, GPIO_MODE_INPUT_OUTPUT_OD);
// }

// static esp_err_t pn532_i2c_init(void)
// {
//     i2c_config_t conf = {
//         .mode = I2C_MODE_MASTER,
//         .sda_io_num = PN532_I2C_SDA_GPIO,
//         .scl_io_num = PN532_I2C_SCL_GPIO,
//         .sda_pullup_en = GPIO_PULLUP_ENABLE,
//         .scl_pullup_en = GPIO_PULLUP_ENABLE,
//         .master.clk_speed = g_i2c_clk_hz,
//     };

//     pn532_i2c_bus_unwedge();
//     esp_err_t del_err = i2c_driver_delete(PN532_I2C_PORT);
//     if (del_err != ESP_OK && del_err != ESP_ERR_INVALID_STATE) {
//         ESP_LOGW(TAG, "i2c_driver_delete warning: %s", esp_err_to_name(del_err));
//     }
//     esp_err_t err = i2c_param_config(PN532_I2C_PORT, &conf);
//     if (err != ESP_OK) {
//         ESP_LOGE(TAG, "i2c_param_config failed: %s", esp_err_to_name(err));
//         return err;
//     }
//     err = i2c_driver_install(PN532_I2C_PORT, conf.mode, 0, 0, 0);
//     if (err != ESP_OK) {
//         ESP_LOGE(TAG, "i2c_driver_install failed: %s", esp_err_to_name(err));
//         return err;
//     }
//     return ESP_OK;
// }

// static esp_err_t pn532_write_raw(const uint8_t *data, size_t len)
// {
//     return i2c_master_write_to_device(PN532_I2C_PORT, g_pn532_addr, data, len, pdMS_TO_TICKS(200));
// }

// static esp_err_t pn532_read_raw(uint8_t *data, size_t len)
// {
//     return i2c_master_read_from_device(PN532_I2C_PORT, g_pn532_addr, data, len, pdMS_TO_TICKS(200));
// }

// static void pn532_log_bytes(const char *label, const uint8_t *buf, size_t len)
// {
//     char line[192];
//     size_t max = len > 20 ? 20 : len;
//     int off = snprintf(line, sizeof(line), "%s (%uB):", label, (unsigned)len);
//     for (size_t i = 0; i < max && off > 0 && off < (int)sizeof(line) - 4; i++) {
//         off += snprintf(&line[off], sizeof(line) - (size_t)off, " %02X", buf[i]);
//     }
//     ESP_LOGW(TAG, "%s%s", line, len > max ? " ..." : "");
// }

// static void pn532_log_i2c_line_levels(const char *stage)
// {
//     gpio_config_t io = {
//         .pin_bit_mask = (1ULL << PN532_I2C_SDA_GPIO) | (1ULL << PN532_I2C_SCL_GPIO),
//         .mode = GPIO_MODE_INPUT,
//         .pull_up_en = GPIO_PULLUP_ENABLE,
//         .pull_down_en = GPIO_PULLDOWN_DISABLE,
//         .intr_type = GPIO_INTR_DISABLE,
//     };
//     (void)gpio_config(&io);

//     int sda = gpio_get_level(PN532_I2C_SDA_GPIO);
//     int scl = gpio_get_level(PN532_I2C_SCL_GPIO);
//     ESP_LOGI(TAG, "%s: I2C line levels SDA=%d SCL=%d (expect 1/1 idle)", stage, sda, scl);
//     if (sda == 0 || scl == 0) {
//         ESP_LOGW(TAG, "I2C line held low before transfer. Check pull-ups/wiring/shorts.");
//     }
// }

// static esp_err_t i2c_probe_addr(uint8_t addr7)
// {
//     i2c_cmd_handle_t cmd = i2c_cmd_link_create();
//     if (!cmd) return ESP_ERR_NO_MEM;
//     i2c_master_start(cmd);
//     i2c_master_write_byte(cmd, (addr7 << 1) | I2C_MASTER_WRITE, true);
//     i2c_master_stop(cmd);
//     esp_err_t err = i2c_master_cmd_begin(PN532_I2C_PORT, cmd, pdMS_TO_TICKS(200));
//     i2c_cmd_link_delete(cmd);
//     return err;
// }

// static int pn532_scan_i2c_bus(uint8_t *found, size_t found_cap)
// {
//     int count = 0;
//     ESP_LOGI(TAG, "Scanning I2C bus for ACK addresses...");
//     for (uint8_t addr = 0x08; addr < 0x78; addr++) {
//         if (i2c_probe_addr(addr) == ESP_OK) {
//             ESP_LOGI(TAG, "I2C device ACK at 0x%02X", addr);
//             if ((size_t)count < found_cap) {
//                 found[count] = addr;
//             }
//             count++;
//         }
//     }
//     if (count == 0) {
//         ESP_LOGW(TAG, "No I2C ACK devices detected.");
//     }
//     return count;
// }

// static esp_err_t pn532_probe_device(void)
// {
//     return i2c_probe_addr(g_pn532_addr);
// }

// static esp_err_t pn532_wait_ready(uint32_t timeout_ms)
// {
//     uint32_t elapsed = 0;
//     while (elapsed < timeout_ms) {
//         uint8_t status = 0;
//         if (pn532_read_raw(&status, 1) == ESP_OK && status == 0x01) return ESP_OK;
//         vTaskDelay(pdMS_TO_TICKS(10));
//         elapsed += 10;
//     }
//     return ESP_ERR_TIMEOUT;
// }

// static esp_err_t pn532_read_ack_frame(void)
// {
//     uint8_t ack[PN532_ACK_FRAME_LEN + 1] = {0};
//     esp_err_t err = pn532_read_raw(ack, sizeof(ack));
//     if (err != ESP_OK) return err;
//     if (memcmp(&ack[1], PN532_ACK_FRAME, PN532_ACK_FRAME_LEN) != 0) {
//         pn532_log_bytes("Unexpected ACK frame", ack, sizeof(ack));
//         return ESP_ERR_INVALID_RESPONSE;
//     }
//     return ESP_OK;
// }

// static esp_err_t pn532_send_command(uint8_t cmd, const uint8_t *payload, size_t payload_len)
// {
//     uint8_t frame[96];
//     const size_t data_len = payload_len + 2; // TFI + CMD + payload
//     if (data_len > 0xFF || data_len + 8 > sizeof(frame)) return ESP_ERR_INVALID_SIZE;

//     size_t idx = 0;
//     frame[idx++] = 0x00; // I2C host preamble byte
//     frame[idx++] = PN532_PREAMBLE;
//     frame[idx++] = PN532_STARTCODE1;
//     frame[idx++] = PN532_STARTCODE2;
//     frame[idx++] = (uint8_t)data_len;
//     frame[idx++] = (uint8_t)(~data_len + 1);
//     frame[idx++] = PN532_HOSTTOPN532;
//     frame[idx++] = cmd;
//     for (size_t i = 0; i < payload_len; i++) {
//         frame[idx++] = payload[i];
//     }

//     uint8_t dcs = (uint8_t)(PN532_HOSTTOPN532 + cmd);
//     for (size_t i = 0; i < payload_len; i++) dcs = (uint8_t)(dcs + payload[i]);
//     frame[idx++] = (uint8_t)(~dcs + 1);
//     frame[idx++] = PN532_POSTAMBLE;

//     esp_err_t err = pn532_write_raw(frame, idx);
//     if (err != ESP_OK) {
//         ESP_LOGE(TAG, "pn532 write failed: %s", esp_err_to_name(err));
//         return err;
//     }
//     return err;
// }

// static esp_err_t pn532_read_frame(uint8_t *out, size_t out_len, size_t *actual)
// {
//     uint8_t raw[96] = {0};
//     esp_err_t err = pn532_read_raw(raw, sizeof(raw));
//     if (err != ESP_OK) {
//         ESP_LOGE(TAG, "pn532 read frame failed: %s", esp_err_to_name(err));
//         return err;
//     }

//     if (raw[0] != 0x01) {
//         ESP_LOGW(TAG, "Frame status byte not ready: 0x%02X", raw[0]);
//     }

//     const uint8_t *p = &raw[1];
//     if (p[0] != PN532_PREAMBLE || p[1] != PN532_STARTCODE1 || p[2] != PN532_STARTCODE2) {
//         pn532_log_bytes("Bad frame header", raw, 12);
//         return ESP_ERR_INVALID_RESPONSE;
//     }
//     uint8_t len = p[3];
//     uint8_t lcs = p[4];
//     if ((uint8_t)(len + lcs) != 0x00) {
//         ESP_LOGW(TAG, "LEN/LCS mismatch len=0x%02X lcs=0x%02X", len, lcs);
//         return ESP_ERR_INVALID_CRC;
//     }
//     if (len < 1) return ESP_ERR_INVALID_RESPONSE;
//     if ((size_t)len > out_len) return ESP_ERR_INVALID_SIZE;

//     memcpy(out, &p[5], len);
//     uint8_t dcs = p[5 + len];
//     uint8_t post = p[6 + len];
//     if (post != PN532_POSTAMBLE) {
//         ESP_LOGW(TAG, "Bad postamble: 0x%02X", post);
//         pn532_log_bytes("Frame prefix", raw, 20);
//         return ESP_ERR_INVALID_RESPONSE;
//     }

//     uint8_t sum = 0;
//     for (size_t i = 0; i < len; i++) {
//         sum = (uint8_t)(sum + out[i]);
//     }
//     if ((uint8_t)(sum + dcs) != 0x00) {
//         ESP_LOGW(TAG, "DCS mismatch sum=0x%02X dcs=0x%02X", sum, dcs);
//         pn532_log_bytes("Frame prefix", raw, 24);
//         return ESP_ERR_INVALID_CRC;
//     }

//     *actual = len;
//     return ESP_OK;
// }

// static esp_err_t pn532_exchange(uint8_t cmd, const uint8_t *payload, size_t payload_len, uint8_t *resp, size_t resp_len, size_t *resp_actual)
// {
//     esp_err_t err = ESP_FAIL;
//     int retries = PN532_MAX_RETRIES;
//     uint32_t resp_wait_ms = PN532_RESP_WAIT_MS;
//     if (cmd == PN532_CMD_TGINITASTARGET) {
//         resp_wait_ms = PN532_RESP_WAIT_TARGET_MS;
//         retries = 1;
//     } else if (cmd == PN532_CMD_TGGETDATA) {
//         resp_wait_ms = PN532_RESP_WAIT_GETDATA_MS;
//         retries = 1;
//     }
//     for (int attempt = 1; attempt <= retries; attempt++) {
//         err = pn532_send_command(cmd, payload, payload_len);
//         if (err != ESP_OK) {
//             ESP_LOGW(TAG, "send cmd failed attempt=%d err=%s", attempt, esp_err_to_name(err));
//             continue;
//         }

//         err = pn532_wait_ready(PN532_ACK_WAIT_MS);
//         if (err != ESP_OK) {
//             ESP_LOGW(TAG, "wait ready(ack) timeout attempt=%d err=%s", attempt, esp_err_to_name(err));
//             continue;
//         }

//         err = pn532_read_ack_frame();
//         if (err != ESP_OK) {
//             ESP_LOGW(TAG, "ack read failed attempt=%d err=%s", attempt, esp_err_to_name(err));
//             continue;
//         }

//         err = pn532_wait_ready(resp_wait_ms);
//         if (err != ESP_OK) {
//             ESP_LOGW(TAG, "wait ready(resp) timeout attempt=%d err=%s", attempt, esp_err_to_name(err));
//             continue;
//         }

//         err = pn532_read_frame(resp, resp_len, resp_actual);
//         if (err == ESP_OK) return ESP_OK;

//         ESP_LOGW(TAG, "response parse failed attempt=%d err=%s", attempt, esp_err_to_name(err));
//         vTaskDelay(pdMS_TO_TICKS(50));
//     }
//     return err;
// }

// static esp_err_t pn532_get_firmware_version(uint32_t *fw_version)
// {
//     uint8_t resp[64];
//     size_t resp_len = 0;
//     esp_err_t err = pn532_exchange(PN532_CMD_GETFIRMWAREVERSION, NULL, 0, resp, sizeof(resp), &resp_len);
//     if (err != ESP_OK) {
//         ESP_LOGE(TAG, "GetFirmwareVersion failed: %s", esp_err_to_name(err));
//         return err;
//     }
//     if (resp_len < 6 || resp[0] != PN532_PN532TOHOST || resp[1] != (PN532_CMD_GETFIRMWAREVERSION + 1)) {
//         pn532_log_bytes("GetFirmwareVersion unexpected response", resp, resp_len);
//         return ESP_ERR_INVALID_RESPONSE;
//     }

//     *fw_version = ((uint32_t)resp[2] << 24)
//                 | ((uint32_t)resp[3] << 16)
//                 | ((uint32_t)resp[4] << 8)
//                 | (uint32_t)resp[5];
//     ESP_LOGI(TAG, "PN532 firmware IC=0x%02X Ver=%u.%u Support=0x%02X",
//              resp[2], (unsigned int)resp[3], (unsigned int)resp[4], resp[5]);
//     return ESP_OK;
// }

// static esp_err_t pn532_sam_config(void)
// {
//     // Normal mode, timeout 1s, use IRQ pin.
//     const uint8_t sam_cfg[] = {0x01, 0x14, 0x01};
//     uint8_t resp[64];
//     size_t resp_len = 0;
//     esp_err_t err = pn532_exchange(PN532_CMD_SAMCONFIGURATION, sam_cfg, sizeof(sam_cfg), resp, sizeof(resp), &resp_len);
//     if (err != ESP_OK) {
//         ESP_LOGE(TAG, "SAM config failed: %s", esp_err_to_name(err));
//         return err;
//     }
//     return err;
// }

// static esp_err_t pn532_in_data_exchange(const uint8_t *cmd_data, size_t cmd_len, uint8_t *out, size_t out_cap, size_t *out_len)
// {
//     uint8_t resp[96];
//     size_t resp_len = 0;
//     esp_err_t err = pn532_exchange(PN532_CMD_INDATAEXCHANGE, cmd_data, cmd_len, resp, sizeof(resp), &resp_len);
//     if (err != ESP_OK) return err;
//     if (resp_len < 3 || resp[0] != PN532_PN532TOHOST || resp[1] != (PN532_CMD_INDATAEXCHANGE + 1)) {
//         pn532_log_bytes("InDataExchange bad response", resp, resp_len);
//         return ESP_ERR_INVALID_RESPONSE;
//     }
//     if (resp[2] != 0x00) {
//         ESP_LOGW(TAG, "InDataExchange status=0x%02X", resp[2]);
//         return ESP_FAIL;
//     }

//     size_t data_len = resp_len - 3;
//     if (data_len > out_cap) return ESP_ERR_INVALID_SIZE;
//     if (data_len > 0 && out) {
//         memcpy(out, &resp[3], data_len);
//     }
//     if (out_len) *out_len = data_len;
//     return ESP_OK;
// }

// static esp_err_t pn532_poll_passive_target(uint8_t *uid, size_t uid_cap, size_t *uid_len)
// {
//     const uint8_t payload[] = {0x01, 0x00}; // maxTg=1, 106 kbps Type A
//     uint8_t resp[64];
//     size_t resp_len = 0;
//     esp_err_t err = pn532_exchange(PN532_CMD_INLISTPASSIVETARGET, payload, sizeof(payload), resp, sizeof(resp), &resp_len);
//     if (err == ESP_ERR_TIMEOUT || err == ESP_ERR_NOT_FOUND) {
//         if (uid_len) *uid_len = 0;
//         return ESP_ERR_NOT_FOUND;
//     }
//     if (err != ESP_OK) return err;
//     if (resp_len < 3 || resp[0] != PN532_PN532TOHOST || resp[1] != (PN532_CMD_INLISTPASSIVETARGET + 1)) {
//         pn532_log_bytes("InListPassiveTarget bad response", resp, resp_len);
//         return ESP_ERR_INVALID_RESPONSE;
//     }
//     if (resp[2] == 0) {
//         if (uid_len) *uid_len = 0;
//         return ESP_ERR_NOT_FOUND;
//     }
//     if (resp_len < 8) return ESP_ERR_INVALID_RESPONSE;

//     const uint8_t parsed_uid_len = resp[7];
//     if (resp_len < (size_t)(8 + parsed_uid_len)) return ESP_ERR_INVALID_RESPONSE;
//     if ((size_t)parsed_uid_len > uid_cap) return ESP_ERR_INVALID_SIZE;

//     memcpy(uid, &resp[8], parsed_uid_len);
//     if (uid_len) *uid_len = parsed_uid_len;
//     return ESP_OK;
// }

// static esp_err_t pn532_mifare_auth_a(uint8_t block, const uint8_t key[6], const uint8_t *uid, size_t uid_len)
// {
//     if (uid_len < MIFARE_CLASSIC_UID_LEN) {
//         ESP_LOGW(TAG, "Auth requires 4-byte UID, got len=%u", (unsigned)uid_len);
//         return ESP_ERR_INVALID_ARG;
//     }

//     uint8_t cmd[13];
//     cmd[0] = 0x01; // target number
//     cmd[1] = MIFARE_CMD_AUTH_A;
//     cmd[2] = block;
//     memcpy(&cmd[3], key, 6);
//     memcpy(&cmd[9], uid, MIFARE_CLASSIC_UID_LEN);
//     return pn532_in_data_exchange(cmd, sizeof(cmd), NULL, 0, NULL);
// }

// static esp_err_t pn532_mifare_write_block(uint8_t block, const uint8_t data[16])
// {
//     uint8_t cmd[19];
//     cmd[0] = 0x01; // target number
//     cmd[1] = MIFARE_CMD_WRITE;
//     cmd[2] = block;
//     memcpy(&cmd[3], data, 16);
//     return pn532_in_data_exchange(cmd, sizeof(cmd), NULL, 0, NULL);
// }

// static esp_err_t pn532_mifare_read_block(uint8_t block, uint8_t out[16])
// {
//     uint8_t cmd[] = {0x01, MIFARE_CMD_READ, block};
//     size_t out_len = 0;
//     esp_err_t err = pn532_in_data_exchange(cmd, sizeof(cmd), out, 16, &out_len);
//     if (err != ESP_OK) return err;
//     if (out_len != 16) {
//         ESP_LOGW(TAG, "Read block %u returned %u bytes (expected 16)", (unsigned)block, (unsigned)out_len);
//         return ESP_ERR_INVALID_RESPONSE;
//     }
//     return ESP_OK;
// }

// static void fill_dummy_block(uint8_t out[16], const char *text)
// {
//     memset(out, ' ', 16);
//     if (!text) return;
//     size_t n = strlen(text);
//     if (n > 16) n = 16;
//     memcpy(out, text, n);
// }

// static esp_err_t pn532_tg_init_as_target(void)
// {
//     // Full Type A target init payload (matches known-good PN532 card emulation layout).
//     const uint8_t target_params[] = {
//         0x00,                         // MODE
//         0x04, 0x00,                   // SENS_RES
//         0x12, 0x34, 0x56,             // NFCID1t
//         0x20,                         // SEL_RES
//         // FeliCa params (18 bytes)
//         0x01, 0xFE, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7, // NFCID2t
//         0xC0, 0xC1, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, // PAD
//         0xFF, 0xFF,                   // System code
//         // NFCID3t (10 bytes)
//         0xAA, 0x99, 0x88, 0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11,
//         0x00,                         // General bytes length
//         0x00,                         // Historical bytes length
//     };

//     uint8_t resp[96];
//     size_t resp_len = 0;
//     return pn532_exchange(PN532_CMD_TGINITASTARGET, target_params, sizeof(target_params), resp, sizeof(resp), &resp_len);
// }

// static esp_err_t pn532_tg_get_data(uint8_t *buf, size_t buf_len, size_t *actual)
// {
//     uint8_t resp[96];
//     size_t resp_len = 0;
//     esp_err_t err = pn532_exchange(PN532_CMD_TGGETDATA, NULL, 0, resp, sizeof(resp), &resp_len);
//     if (err != ESP_OK) {
//         if (err == ESP_ERR_TIMEOUT) {
//             *actual = 0;
//             return ESP_ERR_NOT_FOUND;
//         }
//         ESP_LOGE(TAG, "tggetdata failed: %s", esp_err_to_name(err));
//         return err;
//     }
//     if (resp_len < 2 || resp[0] != PN532_PN532TOHOST || resp[1] != (PN532_CMD_TGGETDATA + 1)) {
//         return ESP_ERR_INVALID_RESPONSE;
//     }
//     if (resp_len < 3) return ESP_ERR_INVALID_RESPONSE;
//     uint8_t status = resp[2];
//     if (status != 0x00) {
//         // No initiator data available yet (or link-level status), not a hard failure.
//         *actual = 0;
//         return ESP_ERR_NOT_FOUND;
//     }

//     size_t payload_len = resp_len - 3;
//     if (payload_len > buf_len) return ESP_ERR_INVALID_SIZE;
//     if (payload_len > 0) {
//         memcpy(buf, &resp[3], payload_len);
//     }
//     *actual = payload_len;
//     return ESP_OK;
// }

// static esp_err_t pn532_tg_set_data(const uint8_t *buf, size_t len)
// {
//     uint8_t resp[64];
//     size_t resp_len = 0;
//     esp_err_t err = pn532_exchange(PN532_CMD_TGSETDATA, buf, len, resp, sizeof(resp), &resp_len);
//     if (err != ESP_OK) {
//         ESP_LOGE(TAG, "tgsetdata failed: %s", esp_err_to_name(err));
//         return err;
//     }
//     if (resp_len < 3 || resp[0] != PN532_PN532TOHOST || resp[1] != (PN532_CMD_TGSETDATA + 1)) {
//         return ESP_ERR_INVALID_RESPONSE;
//     }
//     if (resp[2] != 0x00) {
//         ESP_LOGW(TAG, "tgsetdata status=0x%02X", resp[2]);
//         return ESP_FAIL;
//     }
//     return err;
// }

// static esp_err_t pn532_runtime_recover(const char *reason)
// {
//     ESP_LOGW(TAG, "Runtime PN532 recover start (%s)", reason ? reason : "unknown");
//     pn532_log_i2c_line_levels("runtime-recover");

//     esp_err_t err = pn532_i2c_init();
//     if (err != ESP_OK) {
//         ESP_LOGW(TAG, "Runtime recover i2c init failed: %s", esp_err_to_name(err));
//         return err;
//     }

//     err = pn532_probe_device();
//     if (err != ESP_OK) {
//         ESP_LOGW(TAG, "Runtime recover probe failed: %s", esp_err_to_name(err));
//         return err;
//     }

//     for (int i = 0; i < PN532_RUNTIME_RECOVER_RETRIES; i++) {
//         err = pn532_sam_config();
//         if (err == ESP_OK) {
//             ESP_LOGI(TAG, "Runtime PN532 recover successful");
//             return ESP_OK;
//         }
//         vTaskDelay(pdMS_TO_TICKS(80));
//     }

//     ESP_LOGW(TAG, "Runtime recover SAM config failed: %s", esp_err_to_name(err));
//     return err;
// }

// static size_t t4t_append_status(uint8_t *resp, size_t resp_cap, size_t data_len, uint8_t sw1, uint8_t sw2)
// {
//     if (resp_cap < data_len + 2) return 0;
//     resp[data_len] = sw1;
//     resp[data_len + 1] = sw2;
//     return data_len + 2;
// }

// static size_t t4t_handle_apdu(const uint8_t *rx, size_t rx_len, uint8_t *resp, size_t resp_cap, bool *handled)
// {
//     static const uint8_t ndef_app_aid[] = {0xD2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x01};
//     *handled = false;
//     if (!rx || rx_len < 4) return 0;

//     uint8_t cla = rx[0];
//     uint8_t ins = rx[1];
//     uint8_t p1 = rx[2];
//     uint8_t p2 = rx[3];

//     size_t lc = 0;
//     const uint8_t *data = NULL;
//     bool has_le = false;
//     size_t le = 0;

//     if (rx_len == 5) {
//         has_le = true;
//         le = rx[4] == 0 ? 256 : rx[4];
//     } else if (rx_len > 5) {
//         lc = rx[4];
//         if (rx_len < 5 + lc) return 0;
//         data = &rx[5];
//         if (rx_len == 5 + lc + 1) {
//             has_le = true;
//             le = rx[5 + lc] == 0 ? 256 : rx[5 + lc];
//         } else if (rx_len != 5 + lc) {
//             return 0;
//         }
//     }

//     if (cla != 0x00) {
//         *handled = true;
//         return t4t_append_status(resp, resp_cap, 0, 0x6E, 0x00);
//     }

//     if (ins == 0xA4) { // SELECT
//         *handled = true;
//         if (p1 == 0x04 && (p2 == 0x00 || p2 == 0x0C)) {
//             if (lc == sizeof(ndef_app_aid) && data && memcmp(data, ndef_app_aid, sizeof(ndef_app_aid)) == 0) {
//                 g_t4t_selected_file = T4T_FILE_ID_NONE;
//                 return t4t_append_status(resp, resp_cap, 0, 0x90, 0x00);
//             }
//             return t4t_append_status(resp, resp_cap, 0, 0x6A, 0x82);
//         }

//         if (p1 == 0x00 && (p2 == 0x00 || p2 == 0x0C) && lc == 2 && data) {
//             uint16_t file_id = (uint16_t)(((uint16_t)data[0] << 8) | data[1]);
//             if (file_id == T4T_FILE_ID_CC || file_id == T4T_FILE_ID_NDEF) {
//                 g_t4t_selected_file = file_id;
//                 return t4t_append_status(resp, resp_cap, 0, 0x90, 0x00);
//             }
//             return t4t_append_status(resp, resp_cap, 0, 0x6A, 0x82);
//         }
//         return t4t_append_status(resp, resp_cap, 0, 0x6A, 0x86);
//     }

//     if (ins == 0xB0) { // READ BINARY
//         *handled = true;
//         if (g_t4t_selected_file == T4T_FILE_ID_NONE) return t4t_append_status(resp, resp_cap, 0, 0x69, 0x86);

//         const uint8_t *src = NULL;
//         size_t src_len = 0;
//         if (g_t4t_selected_file == T4T_FILE_ID_CC) {
//             src = g_t4t_cc_file;
//             src_len = sizeof(g_t4t_cc_file);
//         } else if (g_t4t_selected_file == T4T_FILE_ID_NDEF) {
//             src = g_t4t_ndef_file;
//             src_len = g_t4t_ndef_file_len;
//         }

//         size_t offset = ((size_t)p1 << 8) | p2;
//         size_t req_len = has_le ? le : 0xFF;
//         if (offset >= src_len) return t4t_append_status(resp, resp_cap, 0, 0x6B, 0x00);

//         size_t chunk = src_len - offset;
//         if (chunk > req_len) chunk = req_len;
//         if (resp_cap < chunk + 2) return t4t_append_status(resp, resp_cap, 0, 0x67, 0x00);
//         memcpy(resp, src + offset, chunk);
//         return t4t_append_status(resp, resp_cap, chunk, 0x90, 0x00);
//     }

//     if (ins == 0xC0) { // GET RESPONSE (not needed, but keep graceful)
//         *handled = true;
//         return t4t_append_status(resp, resp_cap, 0, 0x90, 0x00);
//     }

//     *handled = true;
//     return t4t_append_status(resp, resp_cap, 0, 0x6D, 0x00);
// }

// static bool nfc_is_valid_scan_data(const uint8_t *rx, size_t rx_len)
// {
//     if (!rx || rx_len == 0) return false;

//     bool all_zero = true;
//     for (size_t i = 0; i < rx_len; i++) {
//         if (rx[i] != 0x00) {
//             all_zero = false;
//             break;
//         }
//     }
//     if (all_zero) return false;

//     // PN532 target mode often returns status-only frames when no initiator payload exists.
//     if (rx_len == 1) return false;

//     // Status + empty marker pattern observed on idle loops.
//     if (rx_len == 2 && rx[0] == 0x00 && rx[1] == 0x00) return false;

//     return true;
// }

// static bool nfc_is_duplicate_scan(const uint8_t *rx, size_t rx_len, int64_t now_us)
// {
//     const int64_t elapsed_ms = (g_last_scan_ts_us == 0) ? INT64_MAX : ((now_us - g_last_scan_ts_us) / 1000);

//     size_t fp_len = rx_len;
//     if (fp_len > sizeof(g_last_scan_frame)) fp_len = sizeof(g_last_scan_frame);
//     bool same_fingerprint = (fp_len == g_last_scan_frame_len) && (memcmp(rx, g_last_scan_frame, fp_len) == 0);

//     if (elapsed_ms >= 0 && elapsed_ms < SCAN_DEBOUNCE_MS) return true;
//     if (same_fingerprint && elapsed_ms >= 0 && elapsed_ms < SCAN_REPEAT_WINDOW_MS) return true;

//     return false;
// }

// static void nfc_record_scan(const uint8_t *rx, size_t rx_len, int64_t now_us)
// {
//     g_last_scan_ts_us = now_us;
//     g_last_scan_frame_len = rx_len > sizeof(g_last_scan_frame) ? sizeof(g_last_scan_frame) : rx_len;
//     memcpy(g_last_scan_frame, rx, g_last_scan_frame_len);
// }

// typedef struct {
//     bool saw_select_aid;
//     bool saw_select_file;
//     bool saw_read_binary;
//     bool scan_reported;
//     uint32_t apdu_count;
//     uint32_t read_ok_count;
//     uint32_t invalid_frame_count;
//     uint32_t unknown_frame_count;
//     uint32_t tggetdata_fail_count;
//     uint32_t consecutive_tggetdata_fail_count;
//     int64_t started_us;
//     int64_t last_event_us;
// } nfc_session_t;

// static void nfc_session_reset(nfc_session_t *s)
// {
//     memset(s, 0, sizeof(*s));
//     s->started_us = esp_timer_get_time();
//     s->last_event_us = s->started_us;
// }

// static void nfc_session_log_summary(const nfc_session_t *s, const char *reason)
// {
//     int64_t elapsed_ms = (esp_timer_get_time() - s->started_us) / 1000;
//     ESP_LOGI(TAG,
//              "NFC session end (%s): apdu=%lu read_ok=%lu invalid=%lu unknown=%lu tgget_fail=%lu elapsed_ms=%lld",
//              reason ? reason : "unknown",
//              (unsigned long)s->apdu_count,
//              (unsigned long)s->read_ok_count,
//              (unsigned long)s->invalid_frame_count,
//              (unsigned long)s->unknown_frame_count,
//              (unsigned long)s->tggetdata_fail_count,
//              (long long)elapsed_ms);
// }

// static void nfc_log_compact_frame(const char *label, const uint8_t *buf, size_t len)
// {
//     char line[128];
//     size_t max = len > 8 ? 8 : len;
//     int off = snprintf(line, sizeof(line), "%s len=%u:", label, (unsigned)len);
//     for (size_t i = 0; i < max && off > 0 && off < (int)sizeof(line) - 4; i++) {
//         off += snprintf(&line[off], sizeof(line) - (size_t)off, " %02X", buf[i]);
//     }
//     ESP_LOGD(TAG, "%s%s", line, len > max ? " ..." : "");
// }

// static bool apdu_parse_metadata(const uint8_t *rx, size_t rx_len, uint8_t *cla, uint8_t *ins, uint8_t *p1, uint8_t *p2, size_t *lc, size_t *le)
// {
//     if (!rx || rx_len < 4) return false;

//     *cla = rx[0];
//     *ins = rx[1];
//     *p1 = rx[2];
//     *p2 = rx[3];
//     *lc = 0;
//     *le = 0;

//     if (rx_len == 5) {
//         *le = rx[4] == 0 ? 256 : rx[4];
//         return true;
//     }
//     if (rx_len > 5) {
//         *lc = rx[4];
//         if (rx_len < 5 + *lc) return false;
//         if (rx_len == 5 + *lc + 1) {
//             uint8_t le_b = rx[5 + *lc];
//             *le = le_b == 0 ? 256 : le_b;
//             return true;
//         }
//         if (rx_len == 5 + *lc) return true;
//         return false;
//     }
//     return true;
// }

// static void sensor_task(void *param)
// {
//     (void)param;

//     gpio_config_t io = {
//         .pin_bit_mask = (1ULL << DHT_GPIO),
//         .mode = GPIO_MODE_INPUT_OUTPUT,
//         .pull_up_en = GPIO_PULLUP_ENABLE,
//         .pull_down_en = GPIO_PULLDOWN_DISABLE,
//         .intr_type = GPIO_INTR_DISABLE,
//     };
//     gpio_config(&io);
//     gpio_set_level(DHT_GPIO, 1);
//     vTaskDelay(pdMS_TO_TICKS(DHT_STARTUP_DELAY_MS));

//     while (1) {
//         float t = NAN, h = NAN;
//         esp_err_t err = ESP_FAIL;
//         int last_level = gpio_get_level(DHT_GPIO);
//         for (int attempt = 1; attempt <= DHT_READ_RETRIES; attempt++) {
//             err = dht22_read(DHT_GPIO, &t, &h);
//             if (err == ESP_OK) break;
//             last_level = gpio_get_level(DHT_GPIO);
//             if (attempt < DHT_READ_RETRIES) vTaskDelay(pdMS_TO_TICKS(DHT_RETRY_DELAY_MS));
//         }

//         if (err == ESP_OK) {
//             update_payload(t, h);
//             refresh_ndef_payload();
//             ESP_LOGI(TAG, "Sample updated: %s", g_ndef_text);
//         } else {
//             ESP_LOGW(TAG, "DHT22 read failed after %d retries: %s (line_level=%d gpio=%d)",
//                      DHT_READ_RETRIES, esp_err_to_name(err), last_level, (int)DHT_GPIO);
//         }
//         vTaskDelay(pdMS_TO_TICKS(SAMPLE_PERIOD_MS));
//     }
// }

// static void __attribute__((unused)) nfc_task(void *param)
// {
//     (void)param;
//     uint8_t rx[96];
//     uint8_t tx[260];
//     size_t rx_len = 0;
//     size_t tx_len = 0;
//     int init_retry_count = 0;

//     while (1) {
//         esp_err_t init_err = pn532_tg_init_as_target();
//         if (init_err != ESP_OK) {
//             if (init_err == ESP_ERR_TIMEOUT || init_err == ESP_ERR_NOT_FOUND) {
//                 // Keep target init loop calm while no initiator has activated yet.
//                 vTaskDelay(pdMS_TO_TICKS(30));
//                 continue;
//             }
//             init_retry_count++;
//             ESP_LOGW(TAG, "TgInitAsTarget failed retry=%d err=%s", init_retry_count, esp_err_to_name(init_err));
//             vTaskDelay(pdMS_TO_TICKS(500));
//             continue;
//         }
//         if (init_retry_count > 0) {
//             ESP_LOGI(TAG, "TgInitAsTarget recovered after %d retries", init_retry_count);
//             init_retry_count = 0;
//         }

//         g_t4t_selected_file = T4T_FILE_ID_NONE;
//         ESP_LOGI(TAG, "NFC target armed, waiting for phone scan...");
//         nfc_session_t session;
//         nfc_session_reset(&session);
//         int64_t last_wait_log_us = esp_timer_get_time();
//         uint32_t no_data_poll_count = 0;
//         while (1) {
//             int64_t now_us = esp_timer_get_time();
//             if ((now_us - last_wait_log_us) >= 5000000) {
//                 ESP_LOGI(TAG,
//                          "Still waiting for NFC initiator... apdu=%lu invalid=%lu unknown=%lu",
//                          (unsigned long)session.apdu_count,
//                          (unsigned long)session.invalid_frame_count,
//                          (unsigned long)session.unknown_frame_count);
//                 last_wait_log_us = now_us;
//             }

//             esp_err_t get_err = pn532_tg_get_data(rx, sizeof(rx), &rx_len);
//             if (get_err != ESP_OK) {
//                 if (get_err == ESP_ERR_NOT_FOUND) {
//                     no_data_poll_count++;
//                     if (no_data_poll_count >= 300) {
//                         // Avoid sitting in a stale target state forever; re-arm periodically.
//                         ESP_LOGI(TAG, "No initiator payload for extended window; re-arming target");
//                         nfc_session_log_summary(&session, "idle_rearm");
//                         vTaskDelay(pdMS_TO_TICKS(50));
//                         break;
//                     }
//                     vTaskDelay(pdMS_TO_TICKS(30));
//                     continue;
//                 }
//                 session.tggetdata_fail_count++;
//                 session.consecutive_tggetdata_fail_count++;
//                 if (session.consecutive_tggetdata_fail_count >= 3) {
//                     ESP_LOGW(TAG, "tggetdata repeated failures=%lu, re-arming target",
//                              (unsigned long)session.consecutive_tggetdata_fail_count);
//                     (void)pn532_runtime_recover("tggetdata_fail_streak");
//                     nfc_session_log_summary(&session, "tggetdata_rearm");
//                     vTaskDelay(pdMS_TO_TICKS(200));
//                     break;
//                 }
//                 vTaskDelay(pdMS_TO_TICKS(60));
//                 continue;
//             }
//             session.consecutive_tggetdata_fail_count = 0;
//             no_data_poll_count = 0;

//             if (!nfc_is_valid_scan_data(rx, rx_len)) {
//                 session.invalid_frame_count++;
//                 if (session.invalid_frame_count <= 5 || (session.invalid_frame_count % 50) == 0) {
//                     ESP_LOGD(TAG, "Ignoring non-scan TgGetData frame len=%u first=0x%02X cnt=%lu",
//                              (unsigned int)rx_len,
//                              rx_len > 0 ? rx[0] : 0x00,
//                              (unsigned long)session.invalid_frame_count);
//                 }
//                 continue;
//             }

//             refresh_ndef_payload();

//             if (rx_len < 4) {
//                 session.invalid_frame_count++;
//                 nfc_log_compact_frame("Short/non-APDU frame", rx, rx_len);
//                 continue;
//             }

//             uint8_t cla = 0, ins = 0, p1 = 0, p2 = 0;
//             size_t lc = 0, le = 0;
//             bool meta_ok = apdu_parse_metadata(rx, rx_len, &cla, &ins, &p1, &p2, &lc, &le);
//             if (!meta_ok) {
//                 session.invalid_frame_count++;
//                 nfc_log_compact_frame("Malformed APDU-like frame", rx, rx_len);
//                 continue;
//             }

//             bool handled = false;
//             tx_len = t4t_handle_apdu(rx, rx_len, tx, sizeof(tx), &handled);
//             if (handled && tx_len > 0) {
//                 session.apdu_count++;
//                 session.last_event_us = esp_timer_get_time();
//                 uint8_t sw1 = tx[tx_len - 2];
//                 uint8_t sw2 = tx[tx_len - 1];
//                 ESP_LOGD(TAG,
//                          "APDU cla=0x%02X ins=0x%02X p1=0x%02X p2=0x%02X lc=%u le=%u rx=%u tx=%u sw=%02X%02X",
//                          cla, ins, p1, p2,
//                          (unsigned int)lc, (unsigned int)le,
//                          (unsigned int)rx_len, (unsigned int)tx_len, sw1, sw2);

//                 if (ins == 0xA4 && sw1 == 0x90 && sw2 == 0x00) {
//                     if (p1 == 0x04) session.saw_select_aid = true;
//                     if (p1 == 0x00) session.saw_select_file = true;
//                 } else if (ins == 0xB0 && sw1 == 0x90 && sw2 == 0x00) {
//                     session.saw_read_binary = true;
//                     session.read_ok_count++;
//                 }

//                 if (!session.scan_reported &&
//                     session.saw_select_aid &&
//                     session.saw_select_file &&
//                     session.saw_read_binary) {
//                     session.scan_reported = true;
//                     ESP_LOGI(TAG, "Phone scan detected via APDU session; payload ready: %s", g_ndef_text);
//                 }

//                 if (pn532_tg_set_data(tx, tx_len) != ESP_OK) {
//                     ESP_LOGW(TAG, "Failed to send APDU response; re-arming target.");
//                     nfc_session_log_summary(&session, "tgsetdata_apdu_fail");
//                     break;
//                 }
//                 continue;
//             }

//             session.unknown_frame_count++;
//             nfc_log_compact_frame("Unknown/non-APDU frame", rx, rx_len);
//             now_us = esp_timer_get_time();
//             if (nfc_is_duplicate_scan(rx, rx_len, now_us)) {
//                 ESP_LOGD(TAG, "Ignoring duplicate/debounced scan frame len=%u", (unsigned int)rx_len);
//                 continue;
//             }
//             nfc_record_scan(rx, rx_len, now_us);

//             // Fallback path for non-APDU initiators; keep debug-level to avoid false positive scan logs.
//             ESP_LOGD(TAG, "Sending fallback payload to non-APDU initiator");
//             if (pn532_tg_set_data((const uint8_t *)g_ndef_text, strlen(g_ndef_text)) != ESP_OK) {
//                 ESP_LOGW(TAG, "Fallback payload send failed; re-arming target.");
//                 nfc_session_log_summary(&session, "tgsetdata_fallback_fail");
//                 break;
//             }
//         }
//     }
// }

// static void pn532_writer_task(void *param)
// {
//     (void)param;

//     static const uint8_t default_key_a[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
//     static const uint8_t target_blocks[] = {4, 5}; // safe data blocks in sector 1
//     static const char *dummy_texts[] = {
//         "PN532 TEST BLOCK4",
//         "DUMMY TEXT BLOCK5",
//     };

//     uint8_t uid[10] = {0};
//     size_t uid_len = 0;
//     uint8_t last_uid[10] = {0};
//     size_t last_uid_len = 0;
//     int64_t last_write_us = 0;
//     int64_t last_wait_log_us = 0;

//     while (1) {
//         uid_len = 0;
//         esp_err_t poll_err = pn532_poll_passive_target(uid, sizeof(uid), &uid_len);
//         if (poll_err == ESP_ERR_NOT_FOUND) {
//             int64_t now_us = esp_timer_get_time();
//             if ((now_us - last_wait_log_us) >= 3000000) {
//                 ESP_LOGI(TAG, "No card detected yet. Tap MIFARE Classic 1K card to PN532 antenna.");
//                 last_wait_log_us = now_us;
//             }
//             vTaskDelay(pdMS_TO_TICKS(250));
//             continue;
//         }
//         if (poll_err != ESP_OK) {
//             ESP_LOGW(TAG, "Card detect failed: %s", esp_err_to_name(poll_err));
//             (void)pn532_runtime_recover("poll-passive-target");
//             vTaskDelay(pdMS_TO_TICKS(350));
//             continue;
//         }

//         int64_t now_us = esp_timer_get_time();
//         bool same_uid = (uid_len == last_uid_len) && (uid_len > 0) && (memcmp(uid, last_uid, uid_len) == 0);
//         if (same_uid && ((now_us - last_write_us) < 2000000)) {
//             ESP_LOGD(TAG, "Skipping duplicate UID in debounce window");
//             vTaskDelay(pdMS_TO_TICKS(350));
//             continue;
//         }

//         ESP_LOGI(TAG, "Card detected UID len=%u", (unsigned)uid_len);
//         pn532_log_bytes("Card UID", uid, uid_len);
//         ESP_LOGI(TAG, "Starting dummy write sequence for %u block(s)", (unsigned)(sizeof(target_blocks)));

//         bool sequence_ok = true;
//         for (size_t i = 0; i < sizeof(target_blocks); i++) {
//             const uint8_t block = target_blocks[i];
//             uint8_t write_data[16];
//             uint8_t readback[16] = {0};

//             fill_dummy_block(write_data, dummy_texts[i]);

//             ESP_LOGI(TAG, "Step: Auth block %u using default Key A (FF FF FF FF FF FF)", (unsigned)block);
//             esp_err_t err = pn532_mifare_auth_a(block, default_key_a, uid, uid_len);
//             if (err != ESP_OK) {
//                 ESP_LOGW(TAG, "Auth block %u failed: %s", (unsigned)block, esp_err_to_name(err));
//                 sequence_ok = false;
//                 break;
//             }
//             ESP_LOGI(TAG, "Auth block %u OK", (unsigned)block);

//             pn532_log_bytes("Write payload", write_data, sizeof(write_data));
//             err = pn532_mifare_write_block(block, write_data);
//             if (err != ESP_OK) {
//                 ESP_LOGW(TAG, "Write block %u failed: %s", (unsigned)block, esp_err_to_name(err));
//                 sequence_ok = false;
//                 break;
//             }
//             ESP_LOGI(TAG, "Write block %u OK", (unsigned)block);

//             err = pn532_mifare_read_block(block, readback);
//             if (err != ESP_OK) {
//                 ESP_LOGW(TAG, "Readback block %u failed: %s", (unsigned)block, esp_err_to_name(err));
//                 sequence_ok = false;
//                 break;
//             }

//             pn532_log_bytes("Readback payload", readback, sizeof(readback));
//             if (memcmp(write_data, readback, sizeof(write_data)) != 0) {
//                 ESP_LOGW(TAG, "Verify block %u mismatch", (unsigned)block);
//                 sequence_ok = false;
//                 break;
//             }
//             ESP_LOGI(TAG, "Verify block %u OK", (unsigned)block);
//         }

//         if (sequence_ok) {
//             ESP_LOGI(TAG, "Dummy write sequence PASSED for UID.");
//             ESP_LOGW(TAG, "iPhone note: MIFARE Classic may not be readable by iOS NFC apps.");
//             ESP_LOGW(TAG, "Use NTAG/Ultralight tags to validate phone-readable text/URI behavior.");
//         } else {
//             ESP_LOGW(TAG, "Dummy write sequence FAILED. Keep card steady and retry.");
//         }

//         memcpy(last_uid, uid, uid_len);
//         last_uid_len = uid_len;
//         last_write_us = esp_timer_get_time();
//         vTaskDelay(pdMS_TO_TICKS(600));
//     }
// }

// void app_main(void)
// {
//     esp_err_t ret = nvs_flash_init();
//     if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
//         nvs_flash_erase();
//         nvs_flash_init();
//     }

//     g_lock = xSemaphoreCreateMutex();
//     if (!g_lock) {
//         ESP_LOGE(TAG, "Failed to create mutex");
//         return;
//     }

//     memset(&g_payload, 0, sizeof(g_payload));
//     refresh_ndef_payload();
// #if NFC_DEBUG_VERBOSE
//     esp_log_level_set(TAG, ESP_LOG_DEBUG);
// #endif

//     ESP_LOGI(TAG, "BLE transport disabled (commented out). Starting PN532 MIFARE Classic writer mode.");
//     ESP_LOGI(TAG, "PN532 checklist: board in I2C mode, SDA/SCL pull-ups present, common GND.");
//     ESP_LOGI(TAG, "PN532 config addr=0x%02X sda=%d scl=%d freq=%lu",
//              g_pn532_addr, (int)PN532_I2C_SDA_GPIO, (int)PN532_I2C_SCL_GPIO, (unsigned long)g_i2c_clk_hz);
//     ESP_LOGW(TAG, "iPhone note: MIFARE Classic payloads are often not visible in iOS NFC apps.");
//     ESP_LOGW(TAG, "Use this mode to confirm PN532 write/readback success on card; use NTAG/Ultralight for phone-readable NDEF.");

//     pn532_log_i2c_line_levels("pre-init");
//     ESP_ERROR_CHECK(pn532_i2c_init());

//     uint8_t found_addrs[16] = {0};
//     int found_count = pn532_scan_i2c_bus(found_addrs, sizeof(found_addrs));
//     if (found_count == 0 && g_i2c_clk_hz != PN532_FALLBACK_I2C_HZ) {
//         ESP_LOGW(TAG, "No ACK at %lu Hz. Retrying scan at fallback %d Hz.",
//                  (unsigned long)g_i2c_clk_hz, PN532_FALLBACK_I2C_HZ);
//         g_i2c_clk_hz = PN532_FALLBACK_I2C_HZ;
//         ESP_ERROR_CHECK(pn532_i2c_init());
//         found_count = pn532_scan_i2c_bus(found_addrs, sizeof(found_addrs));
//     }
//     if (found_count > 0) {
//         bool configured_found = false;
//         for (int i = 0; i < found_count && i < (int)sizeof(found_addrs); i++) {
//             if (found_addrs[i] == g_pn532_addr) {
//                 configured_found = true;
//                 break;
//             }
//         }
//         if (!configured_found && found_count == 1) {
//             g_pn532_addr = found_addrs[0];
//             ESP_LOGW(TAG, "Configured addr not found; auto-selecting sole ACK address 0x%02X", g_pn532_addr);
//         } else if (!configured_found) {
//             ESP_LOGW(TAG, "Configured addr 0x%02X not detected. Check PN532_I2C_ADDR_7BIT.", g_pn532_addr);
//         }
//     }

//     esp_err_t probe = pn532_probe_device();
//     if (probe != ESP_OK) {
//         ESP_LOGW(TAG, "PN532 probe did not ACK on 0x%02X: %s", g_pn532_addr, esp_err_to_name(probe));
//     } else {
//         ESP_LOGI(TAG, "PN532 probe ACK received on 0x%02X", g_pn532_addr);
//     }

//     while (1) {
//         uint32_t fw = 0;
//         esp_err_t fw_err = pn532_get_firmware_version(&fw);
//         if (fw_err == ESP_OK) {
//             ESP_LOGI(TAG, "PN532 firmware query successful: 0x%08lX", (unsigned long)fw);
//             break;
//         }
//         pn532_log_i2c_line_levels("fw-retry");
//         ESP_LOGW(TAG, "Firmware query failed (%s), retrying in %d ms",
//                  esp_err_to_name(fw_err), PN532_INIT_RETRY_DELAY_MS);
//         vTaskDelay(pdMS_TO_TICKS(PN532_INIT_RETRY_DELAY_MS));
//     }

//     while (1) {
//         esp_err_t sam_err = pn532_sam_config();
//         if (sam_err == ESP_OK) break;
//         pn532_log_i2c_line_levels("sam-retry");
//         ESP_LOGW(TAG, "SAM config failed (%s), retrying in %d ms",
//                  esp_err_to_name(sam_err), PN532_INIT_RETRY_DELAY_MS);
//         vTaskDelay(pdMS_TO_TICKS(PN532_INIT_RETRY_DELAY_MS));
//     }
//     ESP_LOGI(TAG, "PN532 SAM config successful");

//     xTaskCreate(sensor_task, "sensor", 4096, NULL, 5, NULL);
//     xTaskCreate(pn532_writer_task, "nfc_writer", 6144, NULL, 5, NULL);
// }

// #if 0 // BLE_DISABLED_TEMP_REMAINDER
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
// #endif // BLE_DISABLED_TEMP_REMAINDER