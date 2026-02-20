#include "dht.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_rom_sys.h"
#include "driver/gpio.h"

static int read_bit(gpio_num_t pin)
{
    int count = 0;
    while (!gpio_get_level(pin)) {
        count++;
        esp_rom_delay_us(1);
        if (count > 100) return -1;
    }

    count = 0;
    while (gpio_get_level(pin)) {
        count++;
        esp_rom_delay_us(1);
        if (count > 100) break;
    }

    return count > 40;
}

esp_err_t dht_read_float_data(int type, gpio_num_t pin, float *humidity, float *temperature)
{
    uint8_t data[5] = {0};

    gpio_set_direction(pin, GPIO_MODE_OUTPUT);
    gpio_set_level(pin, 0);
    vTaskDelay(pdMS_TO_TICKS(20));

    gpio_set_level(pin, 1);
    esp_rom_delay_us(40);

    gpio_set_direction(pin, GPIO_MODE_INPUT);

    if (gpio_get_level(pin)) return ESP_FAIL;

    while (!gpio_get_level(pin));
    while (gpio_get_level(pin));

    for (int i = 0; i < 40; i++) {
        int bit = read_bit(pin);
        if (bit < 0) return ESP_FAIL;
        data[i/8] <<= 1;
        data[i/8] |= bit;
    }

    *humidity = ((data[0] << 8) | data[1]) * 0.1f;
    *temperature = ((data[2] << 8) | data[3]) * 0.1f;

    return ESP_OK;
}
