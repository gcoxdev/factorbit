<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import GameBoard from './lib/GameBoard.svelte';
  import Icon from './lib/Icon.svelte';
  import {
    DEFAULT_RANGE,
    createPuzzle,
    diagonalCells,
    isSameCoordinate,
    firstPrimeBetween,
    randomPuzzle,
    type Coordinate,
    type Puzzle,
    type RangeSettings
  } from './lib/game';
  import {
    amountAtLeast,
    canPlayJoin,
    canPlaySplit,
    clonePlayMatrix,
    formatSignalAmount,
    isPositiveAmount,
    joinPlaySignals,
    movePlaySignal,
    playMatrixMatches,
    rightCompressPlayMatrix,
    splitPlaySignal,
    toPlayMatrix,
    type PlayMatrix
  } from './lib/play-matrix';

  type Panel = 'help' | 'settings' | 'solution' | null;
  type SolutionIndex = 0 | 1 | 2;
  type HistoryEntry = { matrix: PlayMatrix; moves: number };
  type RangeDraft = Record<keyof RangeSettings, string>;
  interface RuleSettings {
    allowOverflowSplits: boolean;
    allowFractionalJoins: boolean;
  }

  const DEFAULT_RULES: RuleSettings = {
    allowOverflowSplits: false,
    allowFractionalJoins: false
  };

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

  const storedRules = (() => {
    try {
      const value = JSON.parse(
        localStorage.getItem('factorbit-rules') ?? 'null'
      ) as Partial<RuleSettings> | null;
      return {
        allowOverflowSplits:
          value?.allowOverflowSplits === true,
        allowFractionalJoins:
          value?.allowFractionalJoins === true
      } satisfies RuleSettings;
    } catch {
      return DEFAULT_RULES;
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
  let rules = $state<RuleSettings>({ ...storedRules });
  let draftRules = $state<RuleSettings>({ ...storedRules });
  let puzzle = $state.raw<Puzzle>(initialPuzzle);
  let matrix = $state.raw<PlayMatrix>(toPlayMatrix(initialPuzzle.matrix));
  let selected = $state<Coordinate | null>(null);
  let moves = $state(0);
  let history = $state.raw<HistoryEntry[]>([]);
  let panel = $state<Panel>(null);
  let solutionIndex = $state<SolutionIndex>(0);
  let settingsError = $state('');
  let status = $state('Select a live signal to inspect its possible paths.');
  let showSolvedCard = $state(true);
  let boardScale = $state(
    Number.isInteger(storedBoardScale) &&
      storedBoardScale >= 25 &&
      storedBoardScale <= 100
      ? storedBoardScale
      : 100
  );

  let solved = $derived(
    playMatrixMatches(matrix, puzzle.solutions[0]) ||
      playMatrixMatches(matrix, puzzle.solutions[1])
  );
  let legalMoves = $derived(selected ? diagonalCells(matrix.length, selected) : []);
  let splitReady = $derived(
    selected
      ? canPlaySplit(matrix, selected, rules.allowOverflowSplits)
      : false
  );
  let joinReady = $derived(
    selected
      ? canPlayJoin(matrix, selected, rules.allowFractionalJoins)
      : false
  );
  let solutionMatrices = $derived([
    toPlayMatrix(puzzle.solutions[0]),
    toPlayMatrix(puzzle.solutions[1]),
    toPlayMatrix(puzzle.splitSolution)
  ] as const);
  let boardMatrix = $derived(panel === 'solution' ? solutionMatrices[solutionIndex] : matrix);
  let solutionLeft = $derived(solutionIndex === 1 ? puzzle.factorB : puzzle.factorA);
  let solutionRight = $derived(solutionIndex === 1 ? puzzle.factorA : puzzle.factorB);

  function reachedSolutionIndex(candidate: PlayMatrix): SolutionIndex | null {
    if (playMatrixMatches(candidate, puzzle.solutions[0])) return 0;
    if (playMatrixMatches(candidate, puzzle.solutions[1])) return 1;
    return null;
  }

  function record(action: (current: PlayMatrix) => PlayMatrix, message: string) {
    history = [...history, { matrix: clonePlayMatrix(matrix), moves }];
    const nextMatrix = action(matrix);
    const reachedIndex = reachedSolutionIndex(nextMatrix);
    matrix = nextMatrix;
    moves += 1;
    selected = null;
    if (reachedIndex !== null) solutionIndex = reachedIndex;
    showSolvedCard = true;
    status = reachedIndex !== null
      ? 'Factor lock acquired. The signal resolves cleanly.'
      : message;
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
      record(
        (current) => movePlaySignal(current, source, coordinate),
        'Signal relocated. Its binary value is unchanged.'
      );
      return;
    }
    if (isPositiveAmount(count)) {
      selected = coordinate;
      const amount = formatSignalAmount(count);
      status = amountAtLeast(count, 2)
        ? `${amount} signals share this node. Move one, split one, or join a pair.`
        : 'Equivalent positions are now illuminated along this signal path.';
    }
  }

  function splitSelected() {
    if (!selected || !splitReady) return;
    record(
      (current) => splitPlaySignal(
        current,
        selected!,
        rules.allowOverflowSplits
      ),
      'One signal became two signals worth half as much.'
    );
  }

  function joinSelected() {
    if (!selected || !joinReady) return;
    record(
      (current) => joinPlaySignals(
        current,
        selected!,
        rules.allowFractionalJoins
      ),
      rules.allowFractionalJoins
        ? 'Signals joined left with exact fractional balance.'
        : 'Two equal signals combined into one signal worth twice as much.'
    );
  }

  function compressRight() {
    if (solved || panel === 'solution') return;
    record(
      (current) => rightCompressPlayMatrix(
        current,
        rules.allowOverflowSplits
      ),
      rules.allowOverflowSplits
        ? 'All value compressed into the rightmost cell.'
        : 'Signals compressed to the board’s legal diagonal capacities.'
    );
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    matrix = clonePlayMatrix(previous.matrix);
    moves = previous.moves;
    history = history.slice(0, -1);
    selected = null;
    panel = null;
    showSolvedCard = true;
    status = 'Last operation reversed.';
  }

  function reset() {
    matrix = toPlayMatrix(puzzle.matrix);
    moves = 0;
    history = [];
    selected = null;
    panel = null;
    showSolvedCard = true;
    status = 'Puzzle reset. The original product signal has been restored.';
  }

  function newGame() {
    puzzle = randomPuzzle(range);
    matrix = toPlayMatrix(puzzle.matrix);
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
    matrix = toPlayMatrix(puzzle.matrix);
    moves = 0;
    history = [];
    selected = null;
    panel = null;
    solutionIndex = 0;
    showSolvedCard = true;
    status = 'Training signal 15 loaded. Start by selecting any red signal.';
  }

  function dismissSolvedCard() {
    showSolvedCard = false;
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
    rules = { ...draftRules };
    draftRules = { ...rules };
    localStorage.setItem('factorbit-range', JSON.stringify(rangeDraft(range)));
    localStorage.setItem('factorbit-rules', JSON.stringify(rules));
    newGame();
  }

  function changeBoardScale(direction: -1 | 1) {
    boardScale = Math.min(100, Math.max(25, boardScale + direction * 25));
    localStorage.setItem('factorbit-board-scale', String(boardScale));
  }

  function togglePanel(next: Exclude<Panel, null>) {
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
  <title>Factorbit — Factorization Puzzle</title>
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
      <button type="button" onclick={compressRight} disabled={solved || panel === 'solution'} title="Compress all signals to the right"><Icon name="compress" /><span>Compress</span></button>
      <span class="nav-rule"></span>
      <button class:engaged={panel === 'help'} type="button" onclick={() => togglePanel('help')} title="Field guide (H)"><Icon name="help" /><span>Guide</span></button>
      <button class:engaged={panel === 'settings'} type="button" onclick={() => togglePanel('settings')} title="Game settings (G)"><Icon name="settings" /><span>Settings</span></button>
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
          <span>{panel === 'help' ? 'FIELD GUIDE' : 'GAME SETTINGS'}</span>
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
            <div class="shortcuts"><span>N NEW</span><span>R RESET</span><span>Z UNDO</span><span>G SETTINGS</span><span><b>←</b> JOIN</span><span><b>→</b> SPLIT</span></div>
          </div>
        {:else if panel === 'settings'}
          <form class="settings-content" onsubmit={(event) => { event.preventDefault(); saveSettings(); }}>
            <p class="panel-lede">Tune the hidden factor ranges and choose which experimental signal rules are active.</p>
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
            <fieldset class="rule-settings">
              <legend>EXPERIMENTAL RULES</legend>
              <label class="rule-toggle">
                <input type="checkbox" bind:checked={draftRules.allowOverflowSplits} />
                <span class="toggle-control" aria-hidden="true"><i></i></span>
                <span class="rule-copy">
                  <strong>UNBOUNDED SPLITS</strong>
                  <small>Ignore diagonal capacity. Full compression will place the entire product in the rightmost cell.</small>
                </span>
              </label>
              <label class="rule-toggle">
                <input type="checkbox" bind:checked={draftRules.allowFractionalJoins} />
                <span class="toggle-control" aria-hidden="true"><i></i></span>
                <span class="rule-copy">
                  <strong>FRACTIONAL JOINS</strong>
                  <small>Join a lone signal left into an exact half, then continue with quarters, eighths, and beyond.</small>
                </span>
              </label>
            </fieldset>
            {#if settingsError}<p class="form-error" role="alert">{settingsError}</p>{/if}
            <button class="panel-cta" type="submit">Save & acquire new signal</button>
          </form>
        {/if}
      </aside>
    </div>
  {/if}

</div>
