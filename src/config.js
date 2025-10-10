import dotenv from 'dotenv';
dotenv.config();

export const config = {
  arduino: {
    clientId: process.env.ARDUINO_CLIENT_ID,
    clientSecret: process.env.ARDUINO_CLIENT_SECRET,
    thingId: process.env.ARDUINO_THING_ID,
    vars: {
      pump: process.env.ARDUINO_VAR_PUMP,
      buzzer: process.env.ARDUINO_VAR_BUZZER,
      distance: process.env.ARDUINO_VAR_DISTANCE,
      water: process.env.ARDUINO_VAR_WATER
    }
  }
};
