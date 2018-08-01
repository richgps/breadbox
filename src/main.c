#include "mgos.h"
#include "mgos_i2c.h"
#include "mgos_si7021.h"

static struct mgos_si7021 *s_si7021;

float getTemp() {
  return mgos_si7021_getTemperature(s_si7021);
}

float getHumidity() {
  return mgos_si7021_getHumidity(s_si7021);
}

enum mgos_app_init_result mgos_app_init(void) {
  struct mgos_i2c *i2c;

  i2c=mgos_i2c_get_global();
  if (!i2c) {
    LOG(LL_ERROR, ("I2C bus missing, set i2c.enable=true in mos.yml"));
  } else {
    s_si7021=mgos_si7021_create(i2c, 0x40); // Default I2C address
    if (s_si7021) {
     LOG(LL_INFO, ("Sensor initilaised!"));
    } else {
      LOG(LL_ERROR, ("Could not initialize sensor"));
    }
  }
  return MGOS_APP_INIT_SUCCESS;
}
