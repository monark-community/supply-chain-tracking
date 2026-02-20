#include "dht.h"
#include "driver/gpio.h" //GPIO pins
#include "esp_rom_sys.h" //for ms delay

//DHT 22: 16 bits humidity + 16 bits temperature + 8 bits checksum

static int wait_for_level(gpio_num_t pin, int level, int timeout_us) //wait until GPIO becomes HIGH or LOW
{
    int count = 0;
    while (gpio_get_level(pin) == level) { //Loop while pin stays at a certain level.
        esp_rom_delay_us(1);    //Delay 1 ms
        count++;
        if (count > timeout_us) return -1; //timeout protection
    }
    return count;
}

esp_err_t dht_read_float_data(int type, gpio_num_t pin, float *humidity, float *temperature)
{
    uint8_t data[5] = {0}; //data[0] humidity high byte
                            //data[1] humidity low byte
                            //data[2] temperature high byte
                            //data[3] temperature low byte
                            //data[4] checksum

    gpio_set_direction(pin, GPIO_MODE_OUTPUT);
    gpio_set_level(pin, 0);
    esp_rom_delay_us(20000); //Pull line LOW for 20 s to signal the sensor to start sending data

    gpio_set_level(pin, 1);
    esp_rom_delay_us(40);

    gpio_set_direction(pin, GPIO_MODE_INPUT);

    //snesor response: Low High Low
    if (wait_for_level(pin, 1, 80) < 0) return ESP_FAIL;
    if (wait_for_level(pin, 0, 80) < 0) return ESP_FAIL;
    if (wait_for_level(pin, 1, 80) < 0) return ESP_FAIL;

    for (int i = 0; i < 40; i++) { //read 40 bits
        if (wait_for_level(pin, 0, 50) < 0) return ESP_FAIL;
        int len = wait_for_level(pin, 1, 70); //measure HIGH pulse duration
        if (len < 0) return ESP_FAIL;

        data[i / 8] <<= 1;              //long pulse → bit = 1
        if (len > 28) data[i / 8] |= 1; //short pulse → bit = 0
    }

    uint8_t sum = data[0] + data[1] + data[2] + data[3];
    if (sum != data[4]) return ESP_FAIL;
    //verify checksum to ensure data integrity

    //convert to float values
    *humidity = ((data[0] << 8) | data[1]) * 0.1f;
    *temperature = ((data[2] << 8) | data[3]) * 0.1f;

    return ESP_OK;
}
