import { config } from '../../config/index.js';
import { mockMt5 } from './mock.js';
import { bridgeMt5 } from './bridge.js';

export const mt5 = config.mt5Mode === 'bridge' ? bridgeMt5 : mockMt5;
