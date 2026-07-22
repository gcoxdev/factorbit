export type Coordinate = readonly [row: number, column: number];
export type Matrix = number[][];

export interface Puzzle {
  factorA: number;
  factorB: number;
  product: number;
  productBits: string;
  matrix: Matrix;
  solutions: readonly [Matrix, Matrix];
}

export interface RangeSettings {
  factorAMinimum: number;
  factorAMaximum: number;
  factorBMinimum: number;
  factorBMaximum: number;
}

export const DEFAULT_RANGE: RangeSettings = {
  factorAMinimum: 3,
  factorAMaximum: 20,
  factorBMinimum: 3,
  factorBMaximum: 20
};

export function toBinary(value: number): string {
  return Math.max(0, Math.trunc(value)).toString(2);
}

export function primesBetween(minimum: number, maximum: number): number[] {
  const lower = Math.max(2, Math.ceil(minimum));
  const upper = Math.max(lower, Math.floor(maximum));
  const sieve = Array(upper + 1).fill(true) as boolean[];
  sieve[0] = false;
  sieve[1] = false;

  for (let prime = 2; prime * prime <= upper; prime += 1) {
    if (!sieve[prime]) continue;
    for (let multiple = prime * prime; multiple <= upper; multiple += prime) {
      sieve[multiple] = false;
    }
  }

  return sieve.flatMap((isPrime, value) => (isPrime && value >= lower ? [value] : []));
}

export function startingMatrix(productBits: string): Matrix {
  return Array.from({ length: productBits.length }, (_, row) =>
    Array.from(productBits, (bit) => (row === 0 && bit === '1' ? 1 : 0))
  );
}

export function solutionMatrix(factorRows: number, factorColumns: number, width: number): Matrix {
  const rowBits = toBinary(factorRows).padStart(width, '0');
  const columnBits = Array.from(toBinary(factorColumns).padStart(width, '0'), Number);
  const zeroRow = Array(width).fill(0) as number[];

  return Array.from(rowBits)
    .reverse()
    .map((bit) => (bit === '1' ? [...columnBits] : [...zeroRow]));
}

export function createPuzzle(factorA: number, factorB: number): Puzzle {
  const product = factorA * factorB;
  const productBits = toBinary(product);
  return {
    factorA,
    factorB,
    product,
    productBits,
    matrix: startingMatrix(productBits),
    solutions: [
      solutionMatrix(factorA, factorB, productBits.length),
      solutionMatrix(factorB, factorA, productBits.length)
    ]
  };
}

export function randomPuzzle(
  range: RangeSettings = DEFAULT_RANGE,
  random: () => number = Math.random
): Puzzle {
  const factorAPrimes = primesBetween(range.factorAMinimum, range.factorAMaximum);
  const factorBPrimes = primesBetween(range.factorBMinimum, range.factorBMaximum);
  if (!factorAPrimes.length) throw new Error('Factor A range contains no prime numbers.');
  if (!factorBPrimes.length) throw new Error('Factor B range contains no prime numbers.');
  const choose = (primes: number[]) => primes[Math.min(primes.length - 1, Math.floor(random() * primes.length))];
  return createPuzzle(
    choose(factorAPrimes),
    choose(factorBPrimes)
  );
}

export function cloneMatrix(matrix: Matrix): Matrix {
  return matrix.map((row) => [...row]);
}

export function sameMatrix(left: Matrix, right: Matrix): boolean {
  return left.every((row, rowIndex) =>
    row.every((value, columnIndex) => value === right[rowIndex]?.[columnIndex])
  );
}

export function isSolved(matrix: Matrix, solutions: Puzzle['solutions']): boolean {
  return solutions.some((solution) => sameMatrix(matrix, solution));
}

export function originIndex([row, column]: Coordinate): number {
  return column - row;
}

export function diagonalCells(size: number, coordinate: Coordinate): Coordinate[] {
  const diagonal = originIndex(coordinate);
  if (diagonal < 0) return [];
  return Array.from({ length: size - diagonal }, (_, row) => [row, row + diagonal] as const);
}

export function isSameCoordinate(left: Coordinate, right: Coordinate): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

export function canSplit(matrix: Matrix, coordinate: Coordinate): boolean {
  const nextOrigin = originIndex(coordinate) + 1;
  if (nextOrigin >= matrix.length) return false;
  const nextDiagonal = diagonalCells(matrix.length, [0, nextOrigin]);
  return nextDiagonal.filter(([row, column]) => matrix[row][column] === 0).length >= 2;
}

export function canJoin(matrix: Matrix, coordinate: Coordinate): boolean {
  const [row, column] = coordinate;
  return originIndex(coordinate) > 0 && matrix[row][column] >= 2;
}

export function moveToken(matrix: Matrix, from: Coordinate, to: Coordinate): Matrix {
  if (originIndex(from) !== originIndex(to)) throw new Error('Tokens can only move on their diagonal.');
  if (matrix[from[0]]?.[from[1]] < 1) throw new Error('The source cell is empty.');
  const next = cloneMatrix(matrix);
  next[from[0]][from[1]] -= 1;
  next[to[0]][to[1]] += 1;
  return next;
}

export function splitToken(matrix: Matrix, coordinate: Coordinate): Matrix {
  if (!canSplit(matrix, coordinate)) throw new Error('This signal cannot be split here.');
  const next = cloneMatrix(matrix);
  const nextOrigin = originIndex(coordinate) + 1;
  next[coordinate[0]][coordinate[1]] -= 1;
  next[0][nextOrigin] += 2;
  return next;
}

export function joinTokens(matrix: Matrix, coordinate: Coordinate): Matrix {
  if (!canJoin(matrix, coordinate)) throw new Error('Two signals are required to join.');
  const next = cloneMatrix(matrix);
  const previousOrigin = originIndex(coordinate) - 1;
  next[coordinate[0]][coordinate[1]] -= 2;
  next[0][previousOrigin] += 1;
  return next;
}

export function representedValue(matrix: Matrix): number {
  const width = matrix.length;
  return matrix.reduce(
    (total, row, rowIndex) =>
      total +
      row.reduce((rowTotal, count, columnIndex) => {
        const exponent = width - 1 - originIndex([rowIndex, columnIndex]);
        return rowTotal + (exponent >= 0 ? count * 2 ** exponent : 0);
      }, 0),
    0
  );
}

export function cellValue(size: number, coordinate: Coordinate): number {
  return 2 ** (size - 1 - originIndex(coordinate));
}
