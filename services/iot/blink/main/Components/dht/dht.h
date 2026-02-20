#pragma once
#include "esp_err.h"
#include "driver/gpio.h"

#define DHT_TYPE_AM2301 0

esp_err_t dht_read_float_data(int type, gpio_num_t pin, float *humidity, float *temperature);
