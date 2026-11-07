import { Long } from 'mongodb';
import { Money } from '../../../../shared/kernel/money.js';

/** Dinheiro no banco: centavos como Int64 (nunca double). */
export const toLong = (money: Money): Long => Long.fromNumber(money.cents);
export const fromLong = (value: Long | number): Money => Money.fromCents(Number(value));
