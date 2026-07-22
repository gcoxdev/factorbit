<script lang="ts">
  import type { Coordinate, Matrix } from './game';
  import { cellValue, isSameCoordinate, originIndex } from './game';

  interface Props {
    matrix: Matrix;
    selected: Coordinate | null;
    legalMoves: Coordinate[];
    solutionVisible: boolean;
    solved: boolean;
    oncell: (coordinate: Coordinate) => void;
  }

  let { matrix, selected, legalMoves, solutionVisible, solved, oncell }: Props = $props();

  const isLegal = (coordinate: Coordinate) =>
    legalMoves.some((candidate) => isSameCoordinate(candidate, coordinate));

  const cellLabel = (coordinate: Coordinate, count: number) => {
    const value = cellValue(matrix.length, coordinate);
    if (count > 0) return `${count} signal${count === 1 ? '' : 's'}, value ${value} each`;
    if (isLegal(coordinate)) return `Move selected signal here, value ${value}`;
    return `Empty signal position, value ${value}`;
  };
</script>

<div class="board-frame" style:--size={matrix.length}>
  <div class="axis axis-top" aria-hidden="true">
    {#each matrix[0] as _, column (`power-${matrix.length - column - 1}`)}
      <span>2<sup>{matrix.length - column - 1}</sup></span>
    {/each}
  </div>

  <div class="row-axis" aria-hidden="true">
    {#each matrix as _, row (`shift-${row}`)}
      <span>{row === 0 ? 'ORIGIN' : `SHIFT ${row}`}</span>
    {/each}
  </div>

  <div class="grid" role="grid" aria-label="Binary factorization signal board">
    <svg class="diagonal" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1="100" x2="100" y2="0"></line>
    </svg>
    {#each matrix as row, rowIndex (`row-${rowIndex}`)}
      {#each row as count, columnIndex (`cell-${rowIndex}-${columnIndex}`)}
        {@const coordinate = [rowIndex, columnIndex] as const}
        {@const active = count > 0}
        {@const chosen = selected && isSameCoordinate(selected, coordinate)}
        {@const legal = isLegal(coordinate)}
        {@const belowDiagonal = originIndex(coordinate) < 0}
        <button
          class={[
            'cell',
            { active, selected: chosen, legal, solved: solved || solutionVisible, dormant: belowDiagonal }
          ]}
          type="button"
          role="gridcell"
          aria-label={cellLabel(coordinate, count)}
          aria-selected={chosen ? 'true' : 'false'}
          disabled={belowDiagonal || solutionVisible || solved || (!active && !legal)}
          onclick={() => oncell(coordinate)}
        >
          <span class="crosshair" aria-hidden="true"></span>
          {#if active}
            <span class="signal" aria-hidden="true">
              <span class="signal-core"></span>
              {#if count > 1}<strong>{count}</strong>{/if}
            </span>
          {:else if legal}
            <span class="landing" aria-hidden="true"></span>
          {/if}
        </button>
      {/each}
    {/each}
  </div>
</div>

<style>
  .board-frame {
    --cell: clamp(2.45rem, 6.2vw, 4.8rem);
    position: relative;
    width: max-content;
    padding: 2.1rem 1.1rem 1.1rem 5.3rem;
  }

  .axis-top {
    position: absolute;
    top: 0;
    left: 5.3rem;
    display: grid;
    grid-template-columns: repeat(var(--size), var(--cell));
    font: 500 0.62rem/1 'DM Mono', monospace;
    letter-spacing: 0.08em;
    color: var(--muted);
    text-align: center;
  }

  .axis-top sup { font-size: 0.55em; }

  .row-axis {
    position: absolute;
    left: 0;
    top: 2.1rem;
    display: grid;
    grid-template-rows: repeat(var(--size), var(--cell));
    width: 4.65rem;
    align-items: center;
    text-align: right;
    font: 500 0.53rem/1 'DM Mono', monospace;
    letter-spacing: 0.12em;
    color: color-mix(in srgb, var(--muted) 76%, transparent);
  }

  .grid {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--size), var(--cell));
    grid-template-rows: repeat(var(--size), var(--cell));
    border-top: 1px solid var(--line);
    border-left: 1px solid var(--line);
    background: color-mix(in srgb, var(--ink-2) 86%, transparent);
  }

  .diagonal {
    position: absolute;
    inset: 0;
    z-index: 2;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  .diagonal line {
    stroke: color-mix(in srgb, var(--cyan) 22%, transparent);
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
  }

  .cell {
    position: relative;
    z-index: 1;
    display: grid;
    place-items: center;
    width: var(--cell);
    height: var(--cell);
    padding: 0;
    border: 0;
    border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    background: transparent;
    color: inherit;
    cursor: default;
  }

  .cell:not(:disabled) { cursor: pointer; }
  .cell:not(:disabled):hover { background: color-mix(in srgb, var(--paper) 4%, transparent); }
  .cell:focus-visible { z-index: 4; outline: 2px solid var(--paper); outline-offset: -3px; }
  .cell.dormant { opacity: 0.12; background: var(--ink); }

  .crosshair::before,
  .crosshair::after {
    content: '';
    position: absolute;
    inset: 50% auto auto 50%;
    width: 0.85rem;
    height: 1px;
    transform: translate(-50%, -50%);
    background: color-mix(in srgb, var(--muted) 25%, transparent);
  }

  .crosshair::after { transform: translate(-50%, -50%) rotate(90deg); }

  .signal {
    display: grid;
    place-items: center;
    width: 54%;
    aspect-ratio: 1;
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    border: 1px solid color-mix(in srgb, var(--red) 55%, white);
    border-radius: 50%;
    background: color-mix(in srgb, var(--red) 15%, transparent);
    box-shadow: 0 0 1.4rem color-mix(in srgb, var(--red) 24%, transparent);
    transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
  }

  .signal-core {
    width: 42%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--red);
    box-shadow: 0 0 0.8rem var(--red);
  }

  .signal strong {
    position: absolute;
    right: -0.35rem;
    top: -0.45rem;
    min-width: 1.2rem;
    height: 1.2rem;
    padding: 0 0.18rem;
    border-radius: 99px;
    background: var(--paper);
    color: var(--ink);
    font: 700 0.66rem/1.2 'DM Mono', monospace;
    display: grid;
    place-items: center;
  }

  .selected .signal {
    transform: translate(-50%, -50%) scale(1.15);
    border-color: var(--acid);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--acid) 14%, transparent), 0 0 1.6rem color-mix(in srgb, var(--acid) 25%, transparent);
  }

  .legal { background: color-mix(in srgb, var(--cyan) 6%, transparent); }
  .landing {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 34%;
    aspect-ratio: 1;
    border: 1px dashed var(--cyan);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    animation: breathe 1.7s ease-in-out infinite;
  }

  .legal.active .signal { border-color: var(--cyan); }
  .solved .signal { border-color: var(--acid); background: color-mix(in srgb, var(--acid) 14%, transparent); }
  .solved .signal-core { background: var(--acid); box-shadow: 0 0 0.9rem var(--acid); }

  @keyframes breathe { 50% { transform: translate(-50%, -50%) scale(1.18); opacity: 0.55; } }

  @media (max-width: 620px) {
    .board-frame { --cell: clamp(2.15rem, 11vw, 3.2rem); padding-left: 3.1rem; }
    .axis-top { left: 3.1rem; }
    .row-axis { width: 2.65rem; }
    .row-axis span { font-size: 0; }
    .row-axis span::after { content: attr(data-short); font-size: 0.48rem; }
  }

  @media (prefers-reduced-motion: reduce) {
    .landing { animation: none; }
    .signal { transition: none; }
  }
</style>
