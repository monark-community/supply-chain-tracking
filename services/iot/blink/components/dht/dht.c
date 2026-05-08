#include "dht.h"
#include "driver/gpio.h"
#include "esp_rom_sys.h"

// DHT22 payload: 16b humidity, 16b temperature, 8b checksum.

static int wait_for_level(gpio_num_t pin, int level, int timeout_us)
{
    int count = 0;
    while (gpio_get_level(pin) == level) {
        esp_rom_delay_us(1);
        count++;
        if (count > timeout_us) return -1;
    }
    return count;
}

esp_err_t dht_read_float_data(int type, gpio_num_t pin, float *humidity, float *temperature)
{
    uint8_t data[5] = {0};

    gpio_set_direction(pin, GPIO_MODE_OUTPUT);
    gpio_set_level(pin, 0);
    // Start signal: pull line low for at least 20ms.
    esp_rom_delay_us(20000);

    gpio_set_level(pin, 1);
    esp_rom_delay_us(40);

    gpio_set_direction(pin, GPIO_MODE_INPUT);

    // Sensor preamble: low -> high -> low.
    if (wait_for_level(pin, 1, 80) < 0) return ESP_FAIL;
    if (wait_for_level(pin, 0, 80) < 0) return ESP_FAIL;
    if (wait_for_level(pin, 1, 80) < 0) return ESP_FAIL;

    for (int i = 0; i < 40; i++) {
        if (wait_for_level(pin, 0, 50) < 0) return ESP_FAIL;
        int len = wait_for_level(pin, 1, 70);
        if (len < 0) return ESP_FAIL;

        data[i / 8] <<= 1;
        if (len > 28) data[i / 8] |= 1;
    }

    uint8_t sum = data[0] + data[1] + data[2] + data[3];
    if (sum != data[4]) return ESP_FAIL;

    *humidity = ((data[0] << 8) | data[1]) * 0.1f;
    *temperature = ((data[2] << 8) | data[3]) * 0.1f;

    return ESP_OK;
}
