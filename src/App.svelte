<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import GameBoard from './lib/GameBoard.svelte';
  import Icon from './lib/Icon.svelte';
  import {
    DEFAULT_RANGE,
    canJoin,
    canSplit,
    cloneMatrix,
    createPuzzle,
    diagonalCells,
    isSameCoordinate,
    isSolved,
    joinTokens,
    moveToken,
    firstPrimeBetween,
    randomPuzzle,
    splitToken,
    type Coordinate,
    type Matrix,
    type Puzzle,
    type RangeSettings
  } from './lib/game';

  type Panel = 'help' | 'settings' | 'solution' | null;
  type SolutionIndex = 0 | 1 | 2;
  type HistoryEntry = { matrix: Matrix; moves: number };
  type RangeDraft = Record<keyof RangeSettings, string>;

  const parseStoredInteger = (value: unknown): bigint | null => {
    if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
    if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
    return null;
  };

  const parseStoredRange = (value: unknown): RangeSettings | null => {
    if (!value || typeof value !== 'object') return null;
    const stored = value as Record<string, unknown>;
    const factorAMinimum = parseStoredInteger(stored.factorAMinimum);
    const factorAMaximum = parseStoredInteger(stored.factorAMaximum);
    const factorBMinimum = parseStoredInteger(stored.factorBMinimum);
    const factorBMaximum = parseStoredInteger(stored.factorBMaximum);
    if (
      factorAMinimum !== null &&
      factorAMaximum !== null &&
      factorBMinimum !== null &&
      factorBMaximum !== null &&
      factorAMinimum >= 2n &&
      factorBMinimum >= 2n &&
      factorAMaximum >= factorAMinimum &&
      factorBMaximum >= factorBMinimum &&
      firstPrimeBetween(factorAMinimum, factorAMaximum) !== null &&
      firstPrimeBetween(factorBMinimum, factorBMaximum) !== null
    ) {
      return { factorAMinimum, factorAMaximum, factorBMinimum, factorBMaximum };
    }

    const minimum = parseStoredInteger(stored.minimum);
    const maximum = parseStoredInteger(stored.maximum);
    if (
      minimum !== null &&
      maximum !== null &&
      minimum >= 2n &&
      maximum >= minimum &&
      firstPrimeBetween(minimum, maximum) !== null
    ) {
      return {
        factorAMinimum: minimum,
        factorAMaximum: maximum,
        factorBMinimum: minimum,
        factorBMaximum: maximum
      };
    }
    return null;
  };

  const storedRange = (() => {
    try {
      return parseStoredRange(
        JSON.parse(localStorage.getItem('factorbit-range') ?? 'null')
      ) ?? DEFAULT_RANGE;
    } catch {
      return DEFAULT_RANGE;
    }
  })();

  const rangeDraft = (value: RangeSettings): RangeDraft => ({
    factorAMinimum: value.factorAMinimum.toString(),
    factorAMaximum: value.factorAMaximum.toString(),
    factorBMinimum: value.factorBMinimum.toString(),
    factorBMaximum: value.factorBMaximum.toString()
  });
  const storedBoardScale = Number(localStorage.getItem('factorbit-board-scale'));
  const initialPuzzle = randomPuzzle(storedRange);
  let range = $state<RangeSettings>({ ...storedRange });
  let draftRange = $state<RangeDraft>(rangeDraft(storedRange));
  let puzzle = $state.raw<Puzzle>(initialPuzzle);
  let matrix = $state.raw<Matrix>(cloneMatrix(initialPuzzle.matrix));
  let selected = $state<Coordinate | null>(null);
  let moves = $state(0);
  let history = $state.raw<HistoryEntry[]>([]);
  let panel = $state<Panel>(null);
  let solutionIndex = $state<SolutionIndex>(0);
  let settingsError = $state('');
  let status = $state('Select a live signal to inspect its possible paths.');
  let showCoach = $state(localStorage.getItem('factorbit-coach-seen') !== 'true');
  let showSolvedCard = $state(true);
  let boardScale = $state(
    Number.isInteger(storedBoardScale) &&
      storedBoardScale >= 25 &&
      storedBoardScale <= 100
      ? storedBoardScale
      : 100
  );

  let solved = $derived(isSolved(matrix, puzzle.solutions));
  let legalMoves = $derived(selected ? diagonalCells(matrix.length, selected) : []);
  let splitReady = $derived(selected ? canSplit(matrix, selected) : false);
  let joinReady = $derived(selected ? canJoin(matrix, selected) : false);
  let solutionMatrices = $derived([puzzle.solutions[0], puzzle.solutions[1], puzzle.splitSolution] as const);
  let boardMatrix = $derived(panel === 'solution' ? solutionMatrices[solutionIndex] : matrix);
  let solutionLeft = $derived(solutionIndex === 1 ? puzzle.factorB : puzzle.factorA);
  let solutionRight = $derived(solutionIndex === 1 ? puzzle.factorA : puzzle.factorB);

  function record(action: (current: Matrix) => Matrix, message: string) {
    history = [...history, { matrix: cloneMatrix(matrix), moves }];
    matrix = action(matrix);
    moves += 1;
    selected = null;
    showSolvedCard = true;
    status = isSolved(matrix, puzzle.solutions) ? 'Factor lock acquired. The signal resolves cleanly.' : message;
  }

  function chooseCell(coordinate: Coordinate) {
    const count = matrix[coordinate[0]][coordinate[1]];
    if (selected && isSameCoordinate(selected, coordinate)) {
      selected = null;
      status = 'Selection cleared.';
      return;
    }
    if (selected && legalMoves.some((candidate) => isSameCoordinate(candidate, coordinate))) {
      const source = selected;
      record((current) => moveToken(current, source, coordinate), 'Signal relocated. Its binary value is unchanged.');
      return;
    }
    if (count > 0) {
      selected = coordinate;
      status = count > 1
        ? `${count} signals share this node. Move one, split one, or join a pair.`
        : 'Equivalent positions are now illuminated along this signal path.';
    }
  }

  function splitSelected() {
    if (!selected || !splitReady) return;
    record((current) => splitToken(current, selected!), 'One signal became two signals worth half as much.');
  }

  function joinSelected() {
    if (!selected || !joinReady) return;
    record((current) => joinTokens(current, selected!), 'Two equal signals combined into one signal worth twice as much.');
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    matrix = cloneMatrix(previous.matrix);
    moves = previous.moves;
    history = history.slice(0, -1);
    selected = null;
    panel = null;
    solutionIndex = 0;
    showSolvedCard = true;
    status = 'Last operation reversed.';
  }

  function reset() {
    matrix = cloneMatrix(puzzle.matrix);
    moves = 0;
    history = [];
    selected = null;
    panel = null;
    solutionIndex = 0;
    showSolvedCard = true;
    status = 'Puzzle reset. The original product signal has been restored.';
  }

  function newGame() {
    puzzle = randomPuzzle(range);
    matrix = cloneMatrix(puzzle.matrix);
    moves = 0;
    history = [];
    selected = null;
    panel = null;
    solutionIndex = 0;
    showSolvedCard = true;
    status = 'New signal acquired. Select a live bit to begin.';
  }

  function loadTeachingPuzzle() {
    puzzle = createPuzzle(3n, 5n);
    matrix = cloneMatrix(puzzle.matrix);
    moves = 0;
    history = [];
    selected = null;
    panel = null;
    solutionIndex = 0;
    showSolvedCard = true;
    status = 'Training signal 15 loaded. Start by selecting any red signal.';
    showCoach = true;
  }

  function dismissCoach() {
    showCoach = false;
    localStorage.setItem('factorbit-coach-seen', 'true');
  }

  function dismissSolvedCard() {
    showSolvedCard = false;
    solutionIndex = 0;
    panel = 'solution';
    selected = null;
  }

  function saveSettings() {
    const values = Object.values(draftRange);
    if (values.some((value) => !/^\d+$/.test(value))) {
      settingsError = 'Use whole numbers of 2 or greater for every bound.';
      return;
    }
    const parsed = Object.fromEntries(
      Object.entries(draftRange).map(([key, value]) => [key, BigInt(value)])
    ) as unknown as RangeSettings;
    if (Object.values(parsed).some((value) => value < 2n)) {
      settingsError = 'Use whole numbers of 2 or greater for every bound.';
      return;
    }
    if (
      parsed.factorAMinimum > parsed.factorAMaximum ||
      parsed.factorBMinimum > parsed.factorBMaximum
    ) {
      settingsError = 'Each minimum must be less than or equal to its matching maximum.';
      return;
    }
    if (firstPrimeBetween(parsed.factorAMinimum, parsed.factorAMaximum) === null) {
      settingsError = 'Factor A range contains no prime numbers.';
      return;
    }
    if (firstPrimeBetween(parsed.factorBMinimum, parsed.factorBMaximum) === null) {
      settingsError = 'Factor B range contains no prime numbers.';
      return;
    }
    settingsError = '';
    range = parsed;
    draftRange = rangeDraft(range);
    localStorage.setItem('factorbit-range', JSON.stringify(rangeDraft(range)));
    newGame();
  }

  function changeBoardScale(direction: -1 | 1) {
    boardScale = Math.min(100, Math.max(25, boardScale + direction * 25));
    localStorage.setItem('factorbit-board-scale', String(boardScale));
  }

  function togglePanel(next: Exclude<Panel, null>) {
    if (next === 'solution' && panel !== 'solution') solutionIndex = 0;
    panel = panel === next ? null : next;
    selected = null;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement) return;
    const key = event.key.toLowerCase();
    if (key === 'n') newGame();
    if (key === 'r') reset();
    if (key === 'z') undo();
    if (key === 'h' || key === '?') togglePanel('help');
    if (key === 'g') togglePanel('settings');
    if (key === 's') togglePanel('solution');
    if (event.key === '-' || event.key === '_') changeBoardScale(-1);
    if (event.key === '+' || event.key === '=') changeBoardScale(1);
    if (event.key === 'ArrowRight' && splitReady) {
      event.preventDefault();
      splitSelected();
    }
    if (event.key === 'ArrowLeft' && joinReady) {
      event.preventDefault();
      joinSelected();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
  <title>Factorbit — Signal factorization puzzle</title>
</svelte:head>

<div class="app-shell">
  <div class="masthead">
    <header class="masthead-primary">
      <a class="brand" href="/" aria-label="Factorbit home">
        <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <strong>FACTORBIT</strong>
      </a>

      <div class="play-controls" aria-label="Current move, transformation, and board scale controls">
        <div class="move-readout" aria-label={`${moves} moves made`}><span>Moves</span><strong>{String(moves).padStart(2, '0')}</strong></div>
        <button class="join-action" type="button" onclick={joinSelected} disabled={!joinReady || solved || panel === 'solution'} title="Join selected signals (Left arrow)"><Icon name="join" /><span>Join</span></button>
        <button class="split-action" type="button" onclick={splitSelected} disabled={!splitReady || solved || panel === 'solution'} title="Split selected signal (Right arrow)"><Icon name="split" /><span>Split</span></button>
        <div class="board-scale-control" aria-label="Board scale">
          <button type="button" onclick={() => changeBoardScale(-1)} disabled={boardScale === 25} aria-label="Make board smaller" title="Make board smaller (-)">−</button>
          <output aria-live="polite">{boardScale}%</output>
          <button type="button" onclick={() => changeBoardScale(1)} disabled={boardScale === 100} aria-label="Make board larger" title="Make board larger (+)">+</button>
        </div>
      </div>
    </header>

    <nav class="utility" aria-label="Game controls">
      <button type="button" onclick={newGame} title="New puzzle (N)"><Icon name="new" /><span>New</span></button>
      <button type="button" onclick={undo} disabled={!history.length} title="Undo (Z)"><Icon name="undo" /><span>Undo</span></button>
      <button type="button" onclick={reset} title="Reset puzzle (R)"><Icon name="reset" /><span>Reset</span></button>
      <span class="nav-rule"></span>
      <button class:engaged={panel === 'help'} type="button" onclick={() => togglePanel('help')} title="Field guide (H)"><Icon name="help" /><span>Guide</span></button>
      <button class:engaged={panel === 'settings'} type="button" onclick={() => togglePanel('settings')} title="Game settings (G)"><Icon name="settings" /><span>Range</span></button>
      <button class:engaged={panel === 'solution'} type="button" onclick={() => togglePanel('solution')} title="Solution (S)"><Icon name="eye" /><span>Resolve</span></button>
    </nav>
  </div>
  <p class="sr-only game-status" aria-live="polite">{status}</p>

  <main>
    <section class={['workbench', { 'solution-visible': panel === 'solution' }]} aria-label="Puzzle workbench">
      {#if panel === 'solution'}
        <div class="solution-trace" transition:fly={{ y: -8, duration: 180 }}>
          <div class="trace-equation">
            <span>SOLUTION TRACE</span>
            <div class="operand"><strong>{solutionLeft}</strong><code>{solutionLeft.toString(2)}</code></div>
            <b>×</b>
            <div class="operand"><strong>{solutionRight}</strong><code>{solutionRight.toString(2)}</code></div>
            <b>=</b>
            <div class="operand product"><strong>{puzzle.product}</strong><code>{puzzle.productBits}</code></div>
          </div>
          <div class="solution-tabs" aria-label="Solution pattern">
            <button class:active={solutionIndex === 0} type="button" onclick={() => (solutionIndex = 0)}>A × B</button>
            <button class:active={solutionIndex === 1} type="button" onclick={() => (solutionIndex = 1)}>B × A</button>
            <button class:active={solutionIndex === 2} type="button" onclick={() => (solutionIndex = 2)}>Split</button>
          </div>
          <button class="icon-button" type="button" onclick={() => (panel = null)} aria-label="Close solution trace"><Icon name="close" /></button>
        </div>
      {/if}

      <div class="board-scroll">
        <GameBoard
          matrix={boardMatrix}
          scale={boardScale / 100}
          {selected}
          {legalMoves}
          solutionVisible={panel === 'solution'}
          {solved}
          oncell={chooseCell}
        />
      </div>

      {#if showCoach && !panel && !solved}
        <aside class="coach" transition:fly={{ y: 12, duration: 220 }}>
          <div class="coach-index">FIELD NOTE 01</div>
          <button class="icon-button" type="button" onclick={dismissCoach} aria-label="Dismiss field note"><Icon name="close" size={17} /></button>
          <h2>Same value.<br />Different position.</h2>
          <p>Select a red signal. Every illuminated point on its diagonal carries exactly the same binary value, so moving there is always safe.</p>
          <button class="text-button" type="button" onclick={dismissCoach}>Begin experiment <Icon name="arrow" size={17} /></button>
        </aside>
      {/if}

      {#if solved && showSolvedCard}
        <aside class="solved-card" transition:fly={{ y: 14, duration: 300 }} aria-label="Puzzle solved">
          <button class="icon-button dismiss-solved" type="button" onclick={dismissSolvedCard} aria-label="Dismiss solved confirmation"><Icon name="close" /></button>
          <span>FACTOR LOCK / CONFIRMED</span>
          <div class="solved-equation" aria-label={`${puzzle.factorA} times ${puzzle.factorB} equals ${puzzle.product}`}>
            <div class="completion-operand"><strong>{puzzle.factorA}</strong><code>{puzzle.factorA.toString(2)}</code></div>
            <b>×</b>
            <div class="completion-operand"><strong>{puzzle.factorB}</strong><code>{puzzle.factorB.toString(2)}</code></div>
            <b>=</b>
            <div class="completion-operand product"><strong>{puzzle.product}</strong><code>{puzzle.productBits}</code></div>
          </div>
          <p>Signal resolved in {moves} move{moves === 1 ? '' : 's'} with full value integrity.</p>
          <button class="next-signal" type="button" onclick={newGame}>Acquire next signal <Icon name="arrow" /></button>
        </aside>
      {/if}
    </section>
  </main>

  {#if panel === 'help' || panel === 'settings'}
    <div class="scrim" transition:fade onclick={(event) => event.target === event.currentTarget && (panel = null)} role="presentation">
      <aside class="panel" transition:fly={{ x: 30, duration: 220 }} aria-label={`${panel} panel`}>
        <div class="panel-head">
          <span>{panel === 'help' ? 'FIELD GUIDE' : 'FACTOR RANGES'}</span>
          <button class="icon-button" type="button" onclick={() => (panel = null)} aria-label="Close panel"><Icon name="close" /></button>
        </div>

        {#if panel === 'help'}
          <div class="guide-content">
            <p class="panel-lede">Factorbit turns binary multiplication inside out: start with a product, then arrange its bits until the factors appear.</p>
            <ol>
              <li><b>01</b><div><strong>MOVE ON A DIAGONAL</strong><p>A signal keeps its value anywhere along its illuminated path.</p></div></li>
              <li><b>02</b><div><strong>SPLIT TO THE RIGHT</strong><p>One signal becomes two signals, each worth half as much.</p></div></li>
              <li><b>03</b><div><strong>JOIN TO THE LEFT</strong><p>Two signals at one node combine into one worth twice as much.</p></div></li>
              <li><b>04</b><div><strong>FIND THE PATTERN</strong><p>Finish when active rows form the binary pattern of one factor, repeated by the other.</p></div></li>
            </ol>
            <button class="panel-cta" type="button" onclick={loadTeachingPuzzle}>Load training signal 15</button>
            <div class="shortcuts"><span>N NEW</span><span>R RESET</span><span>Z UNDO</span><span>G RANGE</span><span><b>←</b> JOIN</span><span><b>→</b> SPLIT</span></div>
          </div>
        {:else if panel === 'settings'}
          <form class="settings-content" onsubmit={(event) => { event.preventDefault(); saveSettings(); }}>
            <p class="panel-lede">Each hidden prime factor is selected independently from the inclusive range you define.</p>
            <fieldset>
              <legend>FACTOR A</legend>
              <label><span>MINIMUM</span><input type="text" inputmode="numeric" pattern="[0-9]*" bind:value={draftRange.factorAMinimum} /></label>
              <label><span>MAXIMUM</span><input type="text" inputmode="numeric" pattern="[0-9]*" bind:value={draftRange.factorAMaximum} /></label>
            </fieldset>
            <fieldset>
              <legend>FACTOR B</legend>
              <label><span>MINIMUM</span><input type="text" inputmode="numeric" pattern="[0-9]*" bind:value={draftRange.factorBMinimum} /></label>
              <label><span>MAXIMUM</span><input type="text" inputmode="numeric" pattern="[0-9]*" bind:value={draftRange.factorBMaximum} /></label>
            </fieldset>
            <div class="range-scale"><span>QUICK</span><i></i><span>COMPLEX</span></div>
            {#if settingsError}<p class="form-error" role="alert">{settingsError}</p>{/if}
            <button class="panel-cta" type="submit">Save & acquire new signal</button>
          </form>
        {/if}
      </aside>
    </div>
  {/if}

</div>
