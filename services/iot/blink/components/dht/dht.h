#pragma once
#include "driver/gpio.h"
#include "esp_err.h"

#define DHT_TYPE_AM2301 1

esp_err_t dht_read_float_data(int type, gpio_num_t pin, float *humidity, float *temperature);
