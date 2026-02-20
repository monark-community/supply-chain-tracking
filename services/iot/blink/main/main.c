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

#include "driver/gpio.h"
#include "esp_rom_sys.h"

#include "os/os_mbuf.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "host/ble_hs.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"

#define DHT_GPIO              GPIO_NUM_4
#define SAMPLE_PERIOD_MS      5000

#define TEMP_MIN_ALLOWED_C    (-10.0f)
#define TEMP_MAX_ALLOWED_C    (60.0f)
#define HUMI_MIN_ALLOWED_PCT  (0.0f)
#define HUMI_MAX_ALLOWED_PCT  (100.0f)

#define FLAG_OK        0x0
#define FLAG_TEMP_OOR  0x1
#define FLAG_HUMI_OOR  0x2

#define MANUAL_MODE 1

#define MAN_TEMP_MIN  10.0f
#define MAN_TEMP_MAX  30.0f
#define MAN_HUMI_MIN  20.0f
#define MAN_HUMI_MAX  60.0f
#define MAN_FLAG      2   // 0,1,2

static const char *TAG = "BLE_DHT22";

typedef struct __attribute__((packed)) {
    float temp_min;
    float temp_max;
    float humi_min;
    float humi_max;
    uint8_t flag2;
} payload_t;

static payload_t g_payload;
static bool g_initialized = false;
static SemaphoreHandle_t g_lock;

static uint8_t g_own_addr_type;
static uint16_t g_conn_handle = BLE_HS_CONN_HANDLE_NONE;
static uint16_t g_attr_handle_payload;

static const ble_uuid128_t g_svc_uuid =
    BLE_UUID128_INIT(0x9a,0x8b,0x7c,0x6d,0x5e,0x4f,0x3a,0x2b,0x1c,0x0d,0xfe,0xed,0xbe,0xef,0x10,0x01);

static const ble_uuid128_t g_chr_uuid =
    BLE_UUID128_INIT(0x9a,0x8b,0x7c,0x6d,0x5e,0x4f,0x3a,0x2b,0x1c,0x0d,0xfe,0xed,0xbe,0xef,0x10,0x02);

static inline int wait_level(gpio_num_t pin, int level, uint32_t timeout_us)
{
    uint32_t t = 0;
    while (gpio_get_level(pin) != level) {
        if (t++ >= timeout_us) return -1;
        esp_rom_delay_us(1);
    }
    return 0;
}

static inline int measure_level(gpio_num_t pin, int level, uint32_t timeout_us, uint32_t *dur_us)
{
    uint32_t t = 0;
    while (gpio_get_level(pin) == level) {
        if (t++ >= timeout_us) return -1;
        esp_rom_delay_us(1);
    }
    *dur_us = t;
    return 0;
}

static esp_err_t dht22_read(gpio_num_t pin, float *temp_c, float *humi_pct)
{
    uint8_t data[5] = {0};

    gpio_set_direction(pin, GPIO_MODE_OUTPUT);
    gpio_set_level(pin, 0);
    vTaskDelay(pdMS_TO_TICKS(2));
    gpio_set_level(pin, 1);
    esp_rom_delay_us(40);
    gpio_set_direction(pin, GPIO_MODE_INPUT);

    if (wait_level(pin, 0, 100) != 0) return ESP_ERR_TIMEOUT;
    if (wait_level(pin, 1, 100) != 0) return ESP_ERR_TIMEOUT;
    if (wait_level(pin, 0, 100) != 0) return ESP_ERR_TIMEOUT;

    for (int i = 0; i < 40; i++) {
        if (wait_level(pin, 1, 70) != 0) return ESP_ERR_TIMEOUT;
        uint32_t high_us = 0;
        if (measure_level(pin, 1, 120, &high_us) != 0) return ESP_ERR_TIMEOUT;
        int bit = (high_us > 40) ? 1 : 0;
        data[i / 8] = (uint8_t)((data[i / 8] << 1) | (uint8_t)bit);
    }

    uint8_t sum = (uint8_t)(data[0] + data[1] + data[2] + data[3]);
    if (sum != data[4]) return ESP_ERR_INVALID_CRC;

    uint16_t rh = (uint16_t)((data[0] << 8) | data[1]);
    uint16_t rt = (uint16_t)((data[2] << 8) | data[3]);

    float hum = rh / 10.0f;

    bool neg = (rt & 0x8000) != 0;
    rt &= 0x7FFF;
    float temp = rt / 10.0f;
    if (neg) temp = -temp;

    *temp_c = temp;
    *humi_pct = hum;
    return ESP_OK;
}

static uint8_t compute_flag(float t, float h)
{
    if (t < TEMP_MIN_ALLOWED_C || t > TEMP_MAX_ALLOWED_C) return FLAG_TEMP_OOR;
    if (h < HUMI_MIN_ALLOWED_PCT || h > HUMI_MAX_ALLOWED_PCT) return FLAG_HUMI_OOR;
    return FLAG_OK;
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

    xSemaphoreGive(g_lock);
}

static void maybe_notify(void)
{
    if (g_conn_handle == BLE_HS_CONN_HANDLE_NONE) return;

    struct ble_gap_conn_desc desc;
    if (ble_gap_conn_find(g_conn_handle, &desc) != 0) return;
    if (!desc.sec_state.encrypted) return;

    payload_t snap;
    xSemaphoreTake(g_lock, portMAX_DELAY);
    snap = g_payload;
    xSemaphoreGive(g_lock);

    struct os_mbuf *om = ble_hs_mbuf_from_flat(&snap, sizeof(snap));
    if (!om) return;
    ble_gatts_notify_custom(g_conn_handle, g_attr_handle_payload, om);
}

static int gatt_access_cb(uint16_t conn_handle, uint16_t attr_handle,
                          struct ble_gatt_access_ctxt *ctxt, void *arg)
{
    (void)attr_handle;
    (void)arg;

    struct ble_gap_conn_desc desc;
    if (ble_gap_conn_find(conn_handle, &desc) == 0) {
        if (!desc.sec_state.encrypted) return BLE_ATT_ERR_INSUFFICIENT_ENC;
    } else {
        return BLE_ATT_ERR_UNLIKELY;
    }

    if (ctxt->op == BLE_GATT_ACCESS_OP_READ_CHR) {
        payload_t snap;
        xSemaphoreTake(g_lock, portMAX_DELAY);
        snap = g_payload;
        xSemaphoreGive(g_lock);
        int rc = os_mbuf_append(ctxt->om, &snap, sizeof(snap));
        return rc == 0 ? 0 : BLE_ATT_ERR_INSUFFICIENT_RES;
    }

    return BLE_ATT_ERR_UNLIKELY;
}

static const struct ble_gatt_svc_def gatt_svcs[] = {
    {
        .type = BLE_GATT_SVC_TYPE_PRIMARY,
        .uuid = &g_svc_uuid.u,
        .characteristics = (struct ble_gatt_chr_def[]){
            {
                .uuid = &g_chr_uuid.u,
                .access_cb = gatt_access_cb,
                .val_handle = &g_attr_handle_payload,
                .flags = BLE_GATT_CHR_F_READ | BLE_GATT_CHR_F_NOTIFY,
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
        if (event->connect.status == 0) {
            g_conn_handle = event->connect.conn_handle;
            ble_gap_security_initiate(g_conn_handle);
        } else {
            g_conn_handle = BLE_HS_CONN_HANDLE_NONE;
            adv_start();
        }
        return 0;

    case BLE_GAP_EVENT_DISCONNECT:
        g_conn_handle = BLE_HS_CONN_HANDLE_NONE;
        adv_start();
        return 0;

    case BLE_GAP_EVENT_ADV_COMPLETE:
        adv_start();
        return 0;

    default:
        return 0;
    }
}

static void adv_start(void)
{
    struct ble_gap_adv_params advp;
    struct ble_hs_adv_fields fields;
    const char *name = ble_svc_gap_device_name();

    memset(&fields, 0, sizeof(fields));
    fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
    fields.tx_pwr_lvl_is_present = 1;
    fields.tx_pwr_lvl = BLE_HS_ADV_TX_PWR_LVL_AUTO;
    fields.name = (uint8_t *)name;
    fields.name_len = (uint8_t)strlen(name);
    fields.name_is_complete = 1;

    ble_gap_adv_set_fields(&fields);

    memset(&advp, 0, sizeof(advp));
    advp.conn_mode = BLE_GAP_CONN_MODE_UND;
    advp.disc_mode = BLE_GAP_DISC_MODE_GEN;

    ble_gap_adv_start(g_own_addr_type, NULL, BLE_HS_FOREVER, &advp, gap_event_cb, NULL);
}

static void on_sync(void)
{
    ble_hs_id_infer_auto(0, &g_own_addr_type);
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
        .mode = GPIO_MODE_INPUT_OUTPUT_OD,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&io);
    gpio_set_level(DHT_GPIO, 1);

    while (1) {
        float t = NAN, h = NAN;
        esp_err_t err = dht22_read(DHT_GPIO, &t, &h);
        if (err == ESP_OK) {
            update_payload(t, h);
            maybe_notify();
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
    g_initialized = true;
    xSemaphoreGive(g_lock);
    #endif

    #if !MANUAL_MODE
    g_payload.temp_min = 0.0f;
    g_payload.temp_max = 0.0f;
    g_payload.humi_min = 0.0f;
    g_payload.humi_max = 0.0f;
    g_payload.flag2 = FLAG_OK;
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

    ble_gatts_count_cfg(gatt_svcs);
    ble_gatts_add_svcs(gatt_svcs);

    ble_svc_gap_device_name_set("ESP32H2-DHT");

    nimble_port_freertos_init(host_task);

    #if !MANUAL_MODE
    xTaskCreate(sensor_task, "sensor", 4096, NULL, 5, NULL);
    #endif
}