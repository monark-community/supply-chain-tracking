#include <stdio.h>
#include <string.h>
#include <math.h>
#include <stdint.h>
#include <stdbool.h>
#include <inttypes.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"

#include "esp_log.h"
#include "esp_err.h"
#include "esp_timer.h"
#include "esp_mac.h"
#include "nvs.h"
#include "nvs_flash.h"

#include "driver/gpio.h"
#include "driver/i2c.h"
#include "mbedtls/md.h"
#include "dht.h"


#define DHT_GPIO              GPIO_NUM_3
#define SAMPLE_PERIOD_MS      3000
#define DHT_STARTUP_DELAY_MS  2000
#define DHT_READ_RETRIES      3
#define DHT_RETRY_DELAY_MS    30

#define ST25DV_I2C_PORT            I2C_NUM_0
#define ST25DV_I2C_SDA_GPIO        GPIO_NUM_8
#define ST25DV_I2C_SCL_GPIO        GPIO_NUM_11
#define ST25DV_GPO_GPIO            GPIO_NUM_5
#define ST25DV_I2C_FREQ_HZ         100000
#define ST25DV_I2C_USER_ADDR_7BIT  0x53
#define ST25DV_WRITE_CHUNK_BYTES   4
#define ST25DV_WRITE_CYCLE_MS      10
#define ST25DV_WRITE_MAX_RETRIES   4
#define ST25DV_WRITE_RETRY_DELAY_MS 5
#define ST25DV_READ_MAX_RETRIES    6
#define ST25DV_READ_RETRY_DELAY_MS 8
#define ST25DV_READ_SETTLE_MS      20
#define ST25DV_MIN_PUSH_MS         2000
#define ST25DV_URI_MAX_LEN         240
#define ST25DV_REGION_CONTROL_BASE 0x0008
#define ST25DV_REGION_TELEM_BASE   0x0400
#define ST25DV_REGION_TELEM_SIZE   192
#define NFC_URI_UPDATE_MIN_MS      60000
#define NFC_TELEM_MIRROR_MIN_MS    30000
#define NFC_CC_REPAIR_MODE         0
#define NFC_CC_REPAIR_DUMP_BYTES   32
#define NFC_CC_REPAIR_TEST_URL     "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
#define NFC_DEEPLINK_BASE_URL      "https://columnists-fully-assembled-trusted.trycloudflare.com/nfc"
#define NFC_SIGNING_KEY            "chainproof-demo-signing-key"
#define NFC_PAYLOAD_VERSION        2
#define NFC_SIG_BYTES              16
#define NFC_STATE_NVS_NAMESPACE    "nfc_state"
#define NFC_STATE_KEY_BOOT_COUNTER "boot_counter"
#define NFC_STATE_KEY_NFC_SEQ      "nfc_seq"
#define NFC_STATE_KEY_SAMPLE_SEQ   "sample_seq"

#define TEMP_MIN_ALLOWED_C    (-5.0f)
#define TEMP_MAX_ALLOWED_C    (27.0f)
#define HUMI_MIN_ALLOWED_PCT  (-5.0f)
#define HUMI_MAX_ALLOWED_PCT  (40.0f)

#define FLAG_OK        0x0
#define FLAG_TEMP_OOR  0x1
#define FLAG_HUMI_OOR  0x2
#define MANUAL_MODE 0
#define MAN_TEMP_MIN  15.0f
#define MAN_TEMP_MAX  30.0f
#define MAN_HUMI_MIN  20.0f
#define MAN_HUMI_MAX  70.0f
#define MAN_FLAG      2

#define HISTORY_MAX 256

static const char *TAG = "NFC_DHT22";

typedef struct __attribute__((packed)) {
    float temp_min;
    float temp_max;
    float humi_min;
    float humi_max;
    uint8_t flag2;
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

static rec_t g_hist[HISTORY_MAX];
static uint16_t g_hist_head = 0;
static uint16_t g_hist_count = 0;
static uint16_t g_seq = 0;

static SemaphoreHandle_t g_lock;

static bool g_nfc_ready = false;
static int64_t g_last_nfc_push_us = 0;
static char g_last_nfc_payload[320];
static int64_t g_last_telem_push_us = 0;
static char g_last_telem_payload[ST25DV_REGION_TELEM_SIZE];
static char g_hardware_id[24] = "unknown";
static uint32_t g_boot_id = 0;
static uint64_t g_nfc_seq = 0;
static uint64_t g_sample_seq = 0;

static int st25dv_stage_max_retries(const char *stage)
{
    if (stage && strcmp(stage, "ndef_tlv") == 0) return 8;
    return ST25DV_WRITE_MAX_RETRIES;
}

static int st25dv_stage_retry_delay_ms(const char *stage)
{
    if (stage && strcmp(stage, "ndef_tlv") == 0) return 12;
    return ST25DV_WRITE_RETRY_DELAY_MS;
}

static bool st25dv_is_retryable_i2c_err(esp_err_t err)
{
    return err == ESP_FAIL || err == ESP_ERR_TIMEOUT || err == ESP_ERR_INVALID_STATE;
}

static esp_err_t nfc_state_storage_init(void)
{
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    return err;
}

static esp_err_t nfc_state_load_and_bump_boot(void)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open(NFC_STATE_NVS_NAMESPACE, NVS_READWRITE, &handle);
    if (err != ESP_OK) return err;

    uint32_t boot_counter = 0;
    uint64_t nfc_seq = 0;
    uint64_t sample_seq = 0;
    (void)nvs_get_u32(handle, NFC_STATE_KEY_BOOT_COUNTER, &boot_counter);
    (void)nvs_get_u64(handle, NFC_STATE_KEY_NFC_SEQ, &nfc_seq);
    (void)nvs_get_u64(handle, NFC_STATE_KEY_SAMPLE_SEQ, &sample_seq);

    if (boot_counter < UINT32_MAX) {
        boot_counter += 1;
    }

    g_boot_id = boot_counter;
    g_nfc_seq = nfc_seq;
    g_sample_seq = sample_seq;

    err = nvs_set_u32(handle, NFC_STATE_KEY_BOOT_COUNTER, g_boot_id);
    if (err == ESP_OK) err = nvs_commit(handle);
    nvs_close(handle);
    return err;
}

static esp_err_t nfc_state_persist_progress(void)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open(NFC_STATE_NVS_NAMESPACE, NVS_READWRITE, &handle);
    if (err != ESP_OK) return err;

    err = nvs_set_u64(handle, NFC_STATE_KEY_NFC_SEQ, g_nfc_seq);
    if (err == ESP_OK) err = nvs_set_u64(handle, NFC_STATE_KEY_SAMPLE_SEQ, g_sample_seq);
    if (err == ESP_OK) err = nvs_commit(handle);
    nvs_close(handle);
    return err;
}

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

static esp_err_t st25dv_i2c_init(void)
{
    i2c_config_t conf = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = ST25DV_I2C_SDA_GPIO,
        .scl_io_num = ST25DV_I2C_SCL_GPIO,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master.clk_speed = ST25DV_I2C_FREQ_HZ,
        .clk_flags = 0,
    };

    esp_err_t err = i2c_param_config(ST25DV_I2C_PORT, &conf);
    if (err != ESP_OK) return err;

    err = i2c_driver_install(ST25DV_I2C_PORT, conf.mode, 0, 0, 0);
    if (err == ESP_ERR_INVALID_STATE) {
        err = i2c_driver_delete(ST25DV_I2C_PORT);
        if (err != ESP_OK) return err;
        err = i2c_driver_install(ST25DV_I2C_PORT, conf.mode, 0, 0, 0);
    }
    return err;
}

static esp_err_t st25dv_probe_address(uint8_t addr_7bit)
{
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    if (!cmd) return ESP_ERR_NO_MEM;
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (addr_7bit << 1) | I2C_MASTER_WRITE, true);
    i2c_master_stop(cmd);
    esp_err_t err = i2c_master_cmd_begin(ST25DV_I2C_PORT, cmd, pdMS_TO_TICKS(100));
    i2c_cmd_link_delete(cmd);
    return err;
}

static void st25dv_log_i2c_scan(void)
{
    int ack_count = 0;
    bool saw_target = false;
    for (uint8_t addr = 0x08; addr < 0x78; ++addr) {
        if (st25dv_probe_address(addr) == ESP_OK) {
            ack_count++;
            ESP_LOGI(TAG, "I2C ACK at 0x%02X", addr);
            if (addr == ST25DV_I2C_USER_ADDR_7BIT) {
                saw_target = true;
            }
        }
    }
    ESP_LOGI(
        TAG,
        "I2C scan complete: ack_count=%d expected_st25dv=0x%02X seen=%s",
        ack_count,
        ST25DV_I2C_USER_ADDR_7BIT,
        saw_target ? "yes" : "no"
    );
}

static void st25dv_gpo_init(void)
{
    gpio_config_t io = {
        .pin_bit_mask = (1ULL << ST25DV_GPO_GPIO),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&io);
}

static esp_err_t st25dv_read_user_bytes(uint16_t mem_addr, uint8_t *data, size_t len)
{
    if (!data || len == 0) return ESP_OK;
    uint8_t addr[2] = {(uint8_t)(mem_addr >> 8), (uint8_t)(mem_addr & 0xFF)};
    return i2c_master_write_read_device(
        ST25DV_I2C_PORT,
        ST25DV_I2C_USER_ADDR_7BIT,
        addr,
        sizeof(addr),
        data,
        len,
        pdMS_TO_TICKS(200)
    );
}

static esp_err_t st25dv_read_user_bytes_with_retry(const char *stage, uint16_t mem_addr, uint8_t *data, size_t len)
{
    esp_err_t err = ESP_FAIL;
    bool busy_logged = false;
    for (int attempt = 1; attempt <= ST25DV_READ_MAX_RETRIES; ++attempt) {
        err = st25dv_read_user_bytes(mem_addr, data, len);
        if (err == ESP_OK) {
            if (attempt > 1) {
                ESP_LOGI(
                    TAG,
                    "ST25DV readback recovered stage=%s addr=0x%04X after %d attempts",
                    stage ? stage : "unknown",
                    mem_addr,
                    attempt
                );
            }
            return ESP_OK;
        }

        if (!st25dv_is_retryable_i2c_err(err)) {
            ESP_LOGW(
                TAG,
                "ST25DV read terminal failure stage=%s addr=0x%04X len=%u err=%s",
                stage ? stage : "unknown",
                mem_addr,
                (unsigned int)len,
                esp_err_to_name(err)
            );
            return err;
        }

        if (!busy_logged) {
            ESP_LOGW(
                TAG,
                "ST25DV readback busy stage=%s addr=0x%04X len=%u; retrying (%d max)",
                stage ? stage : "unknown",
                mem_addr,
                (unsigned int)len,
                ST25DV_READ_MAX_RETRIES
            );
            busy_logged = true;
        }

        if (attempt < ST25DV_READ_MAX_RETRIES) {
            vTaskDelay(pdMS_TO_TICKS(ST25DV_READ_RETRY_DELAY_MS));
        }
    }

    ESP_LOGW(
        TAG,
        "ST25DV readback exhausted retries stage=%s addr=0x%04X len=%u err=%s",
        stage ? stage : "unknown",
        mem_addr,
        (unsigned int)len,
        esp_err_to_name(err)
    );
    return err;
}

static esp_err_t st25dv_write_user_bytes(const char *stage, uint16_t mem_addr, const uint8_t *data, size_t len)
{
    if (!data || len == 0) return ESP_OK;
    const int max_retries = st25dv_stage_max_retries(stage);
    const int retry_delay_ms = st25dv_stage_retry_delay_ms(stage);

    size_t offset = 0;
    while (offset < len) {
        size_t chunk = len - offset;
        if (chunk > ST25DV_WRITE_CHUNK_BYTES) chunk = ST25DV_WRITE_CHUNK_BYTES;

        uint8_t tx[2 + ST25DV_WRITE_CHUNK_BYTES];
        uint16_t addr = (uint16_t)(mem_addr + offset);
        tx[0] = (uint8_t)(addr >> 8);
        tx[1] = (uint8_t)(addr & 0xFF);
        memcpy(&tx[2], &data[offset], chunk);

        esp_err_t err = ESP_FAIL;
        int attempt = 0;
        for (attempt = 1; attempt <= max_retries; ++attempt) {
            err = i2c_master_write_to_device(
                ST25DV_I2C_PORT,
                ST25DV_I2C_USER_ADDR_7BIT,
                tx,
                chunk + 2,
                pdMS_TO_TICKS(200)
            );
            if (err == ESP_OK) break;
            if (!st25dv_is_retryable_i2c_err(err)) {
                ESP_LOGW(
                    TAG,
                    "ST25DV write terminal failure stage=%s addr=0x%04X chunk=%u err=%s",
                    stage ? stage : "unknown",
                    addr,
                    (unsigned int)chunk,
                    esp_err_to_name(err)
                );
                return err;
            }
            if (attempt == 1) {
                ESP_LOGW(
                    TAG,
                    "ST25DV write busy stage=%s addr=0x%04X chunk=%u; retrying (%d max)",
                    stage ? stage : "unknown",
                    addr,
                    (unsigned int)chunk,
                    max_retries
                );
            }
            if (attempt == max_retries) {
                ESP_LOGW(
                    TAG,
                    "ST25DV write exhausted retries stage=%s addr=0x%04X chunk=%u err=%s",
                    stage ? stage : "unknown",
                    addr,
                    (unsigned int)chunk,
                    esp_err_to_name(err)
                );
                return err;
            }
            vTaskDelay(pdMS_TO_TICKS(retry_delay_ms));
        }
        if (attempt > 1) {
            ESP_LOGI(
                TAG,
                "ST25DV write recovered stage=%s addr=0x%04X after %d attempts",
                stage ? stage : "unknown",
                addr,
                attempt
            );
        }

        offset += chunk;
        if (offset < len) vTaskDelay(pdMS_TO_TICKS(ST25DV_WRITE_CYCLE_MS));
    }

    return ESP_OK;
}

static size_t ndef_build_uri_record(const char *uri, uint8_t *out, size_t out_cap)
{
    const char *safe_uri = uri ? uri : "";
    size_t uri_len = strlen(safe_uri);
    if (uri_len > ST25DV_URI_MAX_LEN) uri_len = ST25DV_URI_MAX_LEN;

    size_t payload_len = 1 + uri_len; // URI identifier + URI text.
    if (payload_len > 255) return 0;
    if (out_cap < payload_len + 4) return 0;

    size_t idx = 0;
    out[idx++] = 0xD1;
    out[idx++] = 0x01;
    out[idx++] = (uint8_t)payload_len;
    out[idx++] = 'U';
    out[idx++] = 0x00; // no URI prefix compression
    memcpy(&out[idx], safe_uri, uri_len);
    idx += uri_len;
    return idx;
}

static esp_err_t st25dv_write_ndef_uri(const char *uri)
{
    uint8_t ndef[280];
    uint8_t tlv[288];
    size_t ndef_len = ndef_build_uri_record(uri, ndef, sizeof(ndef));
    if (ndef_len == 0 || ndef_len > 0xFE) return ESP_ERR_INVALID_SIZE;

    size_t tlv_len = 0;
    tlv[tlv_len++] = 0x03;
    tlv[tlv_len++] = (uint8_t)ndef_len;
    memcpy(&tlv[tlv_len], ndef, ndef_len);
    tlv_len += ndef_len;
    tlv[tlv_len++] = 0xFE;

    vTaskDelay(pdMS_TO_TICKS(ST25DV_WRITE_CYCLE_MS));
    esp_err_t err = st25dv_write_user_bytes("ndef_tlv", ST25DV_REGION_CONTROL_BASE, tlv, tlv_len);
    if (err != ESP_OK) {
        ESP_LOGW(
            TAG,
            "Failed TLV write at 0x%04X len=%u: %s",
            ST25DV_REGION_CONTROL_BASE,
            (unsigned int)tlv_len,
            esp_err_to_name(err)
        );
        return err;
    }

    uint8_t tlv_check[8] = {0};
    vTaskDelay(pdMS_TO_TICKS(ST25DV_READ_SETTLE_MS));
    err = st25dv_read_user_bytes_with_retry(
        "tlv_readback",
        ST25DV_REGION_CONTROL_BASE,
        tlv_check,
        sizeof(tlv_check)
    );
    if (err != ESP_OK) return err;

    if (tlv_check[0] != 0x03 || tlv_check[2] != 0xD1 || tlv_check[5] != 'U') {
        ESP_LOGW(
            TAG,
            "ST25DV TLV readback mismatch TLV=[%02X %02X %02X %02X %02X %02X %02X %02X]",
            tlv_check[0], tlv_check[1], tlv_check[2], tlv_check[3],
            tlv_check[4], tlv_check[5], tlv_check[6], tlv_check[7]
        );
        return ESP_ERR_INVALID_RESPONSE;
    }

    ESP_LOGI(TAG, "ST25DV NDEF write/readback verified (TLV)");
    return ESP_OK;
}

#if NFC_CC_REPAIR_MODE
static esp_err_t st25dv_repair_cc_once(void)
{
    static const uint8_t cc_file[8] = {0xE2, 0x40, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00};
    esp_err_t err = st25dv_write_user_bytes("cc_repair", 0x0000, cc_file, sizeof(cc_file));
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "ST25DV CC repair failed: %s", esp_err_to_name(err));
        return err;
    }
    ESP_LOGI(TAG, "ST25DV CC repair write succeeded");
    return ESP_OK;
}

static void st25dv_dump_bytes(uint16_t addr, size_t len)
{
    uint8_t buf[64];
    if (len == 0) return;
    if (len > sizeof(buf)) len = sizeof(buf);

    esp_err_t err = st25dv_read_user_bytes_with_retry("dump_read", addr, buf, len);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "ST25DV dump failed at 0x%04X: %s", addr, esp_err_to_name(err));
        return;
    }

    for (size_t i = 0; i < len; i += 8) {
        size_t rem = len - i;
        size_t n = rem >= 8 ? 8 : rem;
        char line[3 * 8 + 1] = {0};
        size_t p = 0;
        for (size_t j = 0; j < n; ++j) {
            p += (size_t)snprintf(&line[p], sizeof(line) - p, "%02X%s", buf[i + j], (j + 1 < n) ? " " : "");
        }
        ESP_LOGI(TAG, "ST25DV dump 0x%04X: %s", addr + (uint16_t)i, line);
    }
}
#endif

static void st25dv_write_telemetry_mirror(const char *text, int64_t now_us)
{
    if (!text) return;
    if (strcmp(text, g_last_telem_payload) == 0) return;
    if (g_last_telem_push_us > 0 &&
        (now_us - g_last_telem_push_us) < (int64_t)NFC_TELEM_MIRROR_MIN_MS * 1000LL) {
        return;
    }
    uint8_t mirror[ST25DV_REGION_TELEM_SIZE];
    memset(mirror, 0, sizeof(mirror));
    strlcpy((char *)mirror, text, sizeof(mirror));
    esp_err_t err = st25dv_write_user_bytes("telemetry_mirror", ST25DV_REGION_TELEM_BASE, mirror, sizeof(mirror));
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "Telemetry mirror write failed at 0x%04X: %s", ST25DV_REGION_TELEM_BASE, esp_err_to_name(err));
        return;
    }
    strlcpy(g_last_telem_payload, text, sizeof(g_last_telem_payload));
    g_last_telem_push_us = now_us;
}

static void nfc_signature_hex(const char *canonical, char *out, size_t out_cap)
{
    if (!out || out_cap < (NFC_SIG_BYTES * 2 + 1)) return;
    if (!canonical) {
        out[0] = '\0';
        return;
    }

    const mbedtls_md_info_t *md_info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    if (!md_info) {
        out[0] = '\0';
        return;
    }

    uint8_t digest[32] = {0};
    int rc = mbedtls_md_hmac(
        md_info,
        (const unsigned char *)NFC_SIGNING_KEY,
        strlen(NFC_SIGNING_KEY),
        (const unsigned char *)canonical,
        strlen(canonical),
        digest
    );
    if (rc != 0) {
        out[0] = '\0';
        return;
    }

    for (size_t i = 0; i < NFC_SIG_BYTES; ++i) {
        snprintf(&out[i * 2], out_cap - (i * 2), "%02x", digest[i]);
    }
    out[NFC_SIG_BYTES * 2] = '\0';
}

static void nfc_init_hardware_id(void)
{
    uint8_t mac[6] = {0};
    if (esp_efuse_mac_get_default(mac) != ESP_OK) {
        strlcpy(g_hardware_id, "unknown", sizeof(g_hardware_id));
        return;
    }
    snprintf(
        g_hardware_id,
        sizeof(g_hardware_id),
        "%02X%02X%02X%02X%02X%02X",
        mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]
    );
}

static void nfc_publish_sample(float temp_max, float humi_max, uint8_t flag2)
{
    if (!g_nfc_ready) return;

    int64_t now_us = esp_timer_get_time();
    uint64_t next_nfc_seq = g_nfc_seq < UINT64_MAX ? (g_nfc_seq + 1ULL) : g_nfc_seq;
    char canonical[256];
    char signature_hex[80];
    char uri[320];
    snprintf(
        canonical,
        sizeof(canonical),
        "v=%u&hardware_id=%s&boot_id=%" PRIu32 "&nfc_seq=%" PRIu64 "&sample_seq=%" PRIu64 "&temp_max=%.2f&humi_max=%.2f&flag=%u",
        NFC_PAYLOAD_VERSION,
        g_hardware_id,
        g_boot_id,
        next_nfc_seq,
        g_sample_seq,
        temp_max,
        humi_max,
        (unsigned int)flag2
    );
    nfc_signature_hex(canonical, signature_hex, sizeof(signature_hex));
    if (signature_hex[0] == '\0') {
        ESP_LOGW(TAG, "NFC signature generation failed");
        return;
    }
    snprintf(
        uri,
        sizeof(uri),
        "%s?v=%u&hardware_id=%s&boot_id=%" PRIu32 "&nfc_seq=%" PRIu64 "&sample_seq=%" PRIu64 "&temp_max=%.2f&humi_max=%.2f&flag=%u&sig=%s",
        NFC_DEEPLINK_BASE_URL,
        NFC_PAYLOAD_VERSION,
        g_hardware_id,
        g_boot_id,
        next_nfc_seq,
        g_sample_seq,
        temp_max,
        humi_max,
        (unsigned int)flag2,
        signature_hex
    );

    bool interval_due = (g_last_nfc_push_us == 0) ||
        ((now_us - g_last_nfc_push_us) >= (int64_t)NFC_URI_UPDATE_MIN_MS * 1000LL);
    if (!interval_due) {
        return;
    }

    esp_err_t err = st25dv_write_ndef_uri(uri);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "ST25DV NDEF URI write failed: %s", esp_err_to_name(err));
        return;
    }

    g_nfc_seq = next_nfc_seq;
    esp_err_t persist_err = nfc_state_persist_progress();
    if (persist_err != ESP_OK) {
        ESP_LOGW(TAG, "NFC monotonic state persist failed: %s", esp_err_to_name(persist_err));
    }
    strlcpy(g_last_nfc_payload, uri, sizeof(g_last_nfc_payload));
    g_last_nfc_push_us = now_us;
    ESP_LOGI(TAG, "NFC URI updated: %s", uri);
}
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
    if (g_sample_seq < UINT64_MAX) {
        g_sample_seq += 1ULL;
    }

    xSemaphoreGive(g_lock);
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

            nfc_publish_sample(snap.temp_max, snap.humi_max, snap.flag2);
        } else {
            ESP_LOGW(TAG, "DHT22 read failed after %d retries: %s (line_level=%d gpio=%d)",
                     DHT_READ_RETRIES, esp_err_to_name(err), last_level, (int)DHT_GPIO);
        }
        vTaskDelay(pdMS_TO_TICKS(SAMPLE_PERIOD_MS));
    }
}

void app_main(void)
{
    esp_err_t nvs_err = nfc_state_storage_init();
    if (nvs_err == ESP_OK) {
        esp_err_t state_err = nfc_state_load_and_bump_boot();
        if (state_err != ESP_OK) {
            ESP_LOGW(TAG, "Failed loading NFC monotonic state: %s", esp_err_to_name(state_err));
        }
    } else {
        ESP_LOGW(TAG, "Failed initializing NVS for NFC state: %s", esp_err_to_name(nvs_err));
    }
    ESP_LOGI(TAG, "NFC monotonic state boot_id=%" PRIu32 " nfc_seq=%" PRIu64 " sample_seq=%" PRIu64,
             g_boot_id, g_nfc_seq, g_sample_seq);

    g_lock = xSemaphoreCreateMutex();

#if MANUAL_MODE
    xSemaphoreTake(g_lock, portMAX_DELAY);
    g_payload.temp_min = MAN_TEMP_MIN;
    g_payload.temp_max = MAN_TEMP_MAX;
    g_payload.humi_min = MAN_HUMI_MIN;
    g_payload.humi_max = MAN_HUMI_MAX;
    g_payload.flag2    = (uint8_t)MAN_FLAG;
    g_initialized = true;
    hist_push((MAN_TEMP_MIN + MAN_TEMP_MAX) * 0.5f, (MAN_HUMI_MIN + MAN_HUMI_MAX) * 0.5f, (uint8_t)MAN_FLAG);
    xSemaphoreGive(g_lock);
#else
    g_payload.temp_min = 0.0f;
    g_payload.temp_max = 0.0f;
    g_payload.humi_min = 0.0f;
    g_payload.humi_max = 0.0f;
    g_payload.flag2 = FLAG_OK;
#endif

    nfc_init_hardware_id();
    st25dv_gpo_init();
    esp_err_t nfc_init_err = st25dv_i2c_init();
    if (nfc_init_err == ESP_OK) {
        st25dv_log_i2c_scan();
        esp_err_t probe_err = st25dv_probe_address(ST25DV_I2C_USER_ADDR_7BIT);
        g_nfc_ready = (probe_err == ESP_OK);
        ESP_LOGI(TAG, "ST25DV ready=%s on I2C addr=0x%02X SDA=%d SCL=%d GPO=%d",
                 g_nfc_ready ? "true" : "false",
                 ST25DV_I2C_USER_ADDR_7BIT,
                 (int)ST25DV_I2C_SDA_GPIO,
                 (int)ST25DV_I2C_SCL_GPIO,
                 (int)ST25DV_GPO_GPIO);
        if (probe_err != ESP_OK) {
            ESP_LOGW(TAG, "Expected ST25DV address 0x%02X did not ACK: %s", ST25DV_I2C_USER_ADDR_7BIT, esp_err_to_name(probe_err));
        }
#if NFC_CC_REPAIR_MODE
        if (g_nfc_ready) {
            vTaskDelay(pdMS_TO_TICKS(2500));
            ESP_LOGW(TAG, "NFC CC repair mode enabled: repairing CC, writing test URI, dumping bytes");
            esp_err_t repair_err = st25dv_repair_cc_once();
            if (repair_err == ESP_OK) {
                vTaskDelay(pdMS_TO_TICKS(ST25DV_WRITE_CYCLE_MS + ST25DV_READ_SETTLE_MS));
                esp_err_t write_err = st25dv_write_ndef_uri(NFC_CC_REPAIR_TEST_URL);
                ESP_LOGI(TAG, "NFC one-time repair URI write result: %s", esp_err_to_name(write_err));
            }
            st25dv_dump_bytes(0x0000, NFC_CC_REPAIR_DUMP_BYTES);
        }
#endif
    } else {
        g_nfc_ready = false;
        ESP_LOGW(TAG, "ST25DV init failed (NFC disabled): %s", esp_err_to_name(nfc_init_err));
    }

    ESP_LOGI(TAG, "NFC-only mode is active.");

#if !MANUAL_MODE
    xTaskCreate(sensor_task, "sensor", 4096, NULL, 5, NULL);
#endif
}