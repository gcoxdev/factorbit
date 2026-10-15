import {
  originIndex,
  type Coordinate,
  type Matrix
} from './game';

export interface SignalAmount {
  readonly numerator: bigint;
  readonly denominatorPower: number;
}

export type PlayMatrix = SignalAmount[][];

const ZERO: SignalAmount = { numerator: 0n, denominatorPower: 0 };
const ONE: SignalAmount = { numerator: 1n, denominatorPower: 0 };
const TWO: SignalAmount = { numerator: 2n, denominatorPower: 0 };

function normalize(
  numerator: bigint,
  denominatorPower: number
): SignalAmount {
  if (numerator < 0n) throw new Error('Signal amounts cannot be negative.');
  if (!Number.isInteger(denominatorPower) || denominatorPower < 0) {
    throw new Error('A dyadic denominator power must be nonnegative.');
  }
  if (numerator === 0n) return ZERO;
  let reducedNumerator = numerator;
  let reducedPower = denominatorPower;
  while (reducedPower > 0 && (reducedNumerator & 1n) === 0n) {
    reducedNumerator >>= 1n;
    reducedPower -= 1;
  }
  return {
    numerator: reducedNumerator,
    denominatorPower: reducedPower
  };
}

function integerAmount(value: number | bigint): SignalAmount {
  const integer = typeof value === 'bigint' ? value : BigInt(value);
  return normalize(integer, 0);
}

function addAmounts(left: SignalAmount, right: SignalAmount): SignalAmount {
  const power = Math.max(left.denominatorPower, right.denominatorPower);
  return normalize(
    (left.numerator << BigInt(power - left.denominatorPower)) +
      (right.numerator << BigInt(power - right.denominatorPower)),
    power
  );
}

function subtractAmounts(
  left: SignalAmount,
  right: SignalAmount
): SignalAmount {
  const power = Math.max(left.denominatorPower, right.denominatorPower);
  const numerator =
    (left.numerator << BigInt(power - left.denominatorPower)) -
    (right.numerator << BigInt(power - right.denominatorPower));
  return normalize(numerator, power);
}

function halfAmount(value: SignalAmount): SignalAmount {
  return normalize(value.numerator, value.denominatorPower + 1);
}

function doubleAmount(value: SignalAmount): SignalAmount {
  return value.denominatorPower > 0
    ? normalize(value.numerator, value.denominatorPower - 1)
    : normalize(value.numerator << 1n, 0);
}

function scaleByPowerOfTwo(
  value: SignalAmount,
  power: number
): SignalAmount {
  if (power >= value.denominatorPower) {
    return normalize(
      value.numerator << BigInt(power - value.denominatorPower),
      0
    );
  }
  return normalize(value.numerator, value.denominatorPower - power);
}

export function isPositiveAmount(value: SignalAmount): boolean {
  return value.numerator > 0n;
}

export function isOneAmount(value: SignalAmount): boolean {
  return value.denominatorPower === 0 && value.numerator === 1n;
}

export function amountAtLeast(
  value: SignalAmount,
  integer: number
): boolean {
  return value.numerator >=
    (BigInt(integer) << BigInt(value.denominatorPower));
}

export function formatSignalAmount(value: SignalAmount): string {
  if (value.denominatorPower === 0) return value.numerator.toString();
  if (value.denominatorPower > 18) {
    return `${value.numerator}/2^${value.denominatorPower}`;
  }
  const denominator = 1n << BigInt(value.denominatorPower);
  const whole = value.numerator / denominator;
  const remainder = value.numerator % denominator;
  const fractional = (remainder * 5n ** BigInt(value.denominatorPower))
    .toString()
    .padStart(value.denominatorPower, '0')
    .replace(/0+$/, '');
  return `${whole}.${fractional}`;
}

export function toPlayMatrix(matrix: Matrix): PlayMatrix {
  return matrix.map((row) => row.map(integerAmount));
}

export function clonePlayMatrix(matrix: PlayMatrix): PlayMatrix {
  return matrix.map((row) => row.map((amount) => ({ ...amount })));
}

export function samePlayMatrix(
  left: PlayMatrix,
  right: PlayMatrix
): boolean {
  return left.every((row, rowIndex) =>
    row.every((amount, columnIndex) => {
      const other = right[rowIndex]?.[columnIndex];
      return other !== undefined &&
        amount.numerator === other.numerator &&
        amount.denominatorPower === other.denominatorPower;
    })
  );
}

export function playMatrixMatches(
  playMatrix: PlayMatrix,
  integerMatrix: Matrix
): boolean {
  return playMatrix.every((row, rowIndex) =>
    row.every((amount, columnIndex) =>
      amount.denominatorPower === 0 &&
      amount.numerator === BigInt(integerMatrix[rowIndex]?.[columnIndex] ?? -1)
    )
  );
}

export function representedPlayValue(matrix: PlayMatrix): bigint {
  const width = matrix.length;
  let total = ZERO;
  for (let row = 0; row < width; row += 1) {
    for (let column = row; column < matrix[row].length; column += 1) {
      const amount = matrix[row][column];
      if (!isPositiveAmount(amount)) continue;
      const exponent = width - 1 - column + row;
      total = addAmounts(total, scaleByPowerOfTwo(amount, exponent));
    }
  }
  if (total.denominatorPower !== 0) {
    throw new Error('The play board no longer represents a whole product.');
  }
  return total.numerator;
}

export function canPlaySplit(
  matrix: PlayMatrix,
  coordinate: Coordinate,
  allowOverflow: boolean
): boolean {
  const [row, column] = coordinate;
  if (!isPositiveAmount(matrix[row]?.[column] ?? ZERO)) return false;
  const nextOrigin = originIndex(coordinate) + 1;
  if (nextOrigin >= matrix.length) return false;
  if (allowOverflow) return true;
  let emptyCells = 0;
  for (let nextRow = 0;
    nextRow < matrix.length - nextOrigin;
    nextRow += 1) {
    if (!isPositiveAmount(matrix[nextRow][nextRow + nextOrigin])) {
      emptyCells += 1;
    }
    if (emptyCells === 2) return true;
  }
  return false;
}

export function splitPlaySignal(
  matrix: PlayMatrix,
  coordinate: Coordinate,
  allowOverflow: boolean
): PlayMatrix {
  if (!canPlaySplit(matrix, coordinate, allowOverflow)) {
    throw new Error('This signal cannot be split here.');
  }
  const next = clonePlayMatrix(matrix);
  const [row, column] = coordinate;
  const source = next[row][column];
  const splitAmount = amountAtLeast(source, 1) ? ONE : source;
  const nextOrigin = originIndex(coordinate) + 1;
  next[row][column] = subtractAmounts(source, splitAmount);
  next[0][nextOrigin] = addAmounts(
    next[0][nextOrigin],
    doubleAmount(splitAmount)
  );
  return next;
}

export function canPlayJoin(
  matrix: PlayMatrix,
  coordinate: Coordinate,
  allowFractions: boolean
): boolean {
  const [row, column] = coordinate;
  const amount = matrix[row]?.[column] ?? ZERO;
  return originIndex(coordinate) > 0 &&
    (amountAtLeast(amount, 2) ||
      (allowFractions && isPositiveAmount(amount)));
}

export function joinPlaySignals(
  matrix: PlayMatrix,
  coordinate: Coordinate,
  allowFractions: boolean
): PlayMatrix {
  if (!canPlayJoin(matrix, coordinate, allowFractions)) {
    throw new Error('Two signals or fractional joins must be enabled.');
  }
  const next = clonePlayMatrix(matrix);
  const [row, column] = coordinate;
  const source = next[row][column];
  const joinedAmount = amountAtLeast(source, 2) ? TWO : source;
  const previousOrigin = originIndex(coordinate) - 1;
  next[row][column] = subtractAmounts(source, joinedAmount);
  next[0][previousOrigin] = addAmounts(
    next[0][previousOrigin],
    halfAmount(joinedAmount)
  );
  return next;
}

export function movePlaySignal(
  matrix: PlayMatrix,
  from: Coordinate,
  to: Coordinate
): PlayMatrix {
  if (originIndex(from) !== originIndex(to)) {
    throw new Error('Signals can only move on their diagonal.');
  }
  const next = clonePlayMatrix(matrix);
  const source = next[from[0]]?.[from[1]] ?? ZERO;
  if (!isPositiveAmount(source)) throw new Error('The source cell is empty.');
  const movedAmount = amountAtLeast(source, 1) ? ONE : source;
  next[from[0]][from[1]] = subtractAmounts(source, movedAmount);
  next[to[0]][to[1]] = addAmounts(next[to[0]][to[1]], movedAmount);
  return next;
}

function constrainedCompressionCounts(product: bigint, width: number): bigint[] {
  const counts = Array(width).fill(0n) as bigint[];
  let remaining = product;
  for (let distance = 0; distance < width; distance += 1) {
    const capacity = BigInt(distance + 1);
    let count = remaining < capacity ? remaining : capacity;
    if ((count & 1n) !== (remaining & 1n)) count -= 1n;
    counts[width - 1 - distance] = count;
    remaining = (remaining - count) >> 1n;
  }
  if (remaining !== 0n) {
    throw new Error('Right compression exceeded the available board width.');
  }
  return counts;
}

export function rightCompressPlayMatrix(
  matrix: PlayMatrix,
  allowOverflow: boolean
): PlayMatrix {
  const product = representedPlayValue(matrix);
  const width = matrix.length;
  const compressed = Array.from(
    { length: width },
    () => Array.from({ length: width }, () => ZERO)
  );
  if (allowOverflow) {
    compressed[0][width - 1] = integerAmount(product);
    return compressed;
  }
  const counts = constrainedCompressionCounts(product, width);
  for (let column = 0; column < width; column += 1) {
    compressed[0][column] = integerAmount(counts[column]);
  }
  return compressed;
}
