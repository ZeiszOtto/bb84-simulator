# BB84 Quantum Key Distribution Simulator

[![Tests](https://github.com/ZeiszOtto/bb84-simulator/actions/workflows/test.yml/badge.svg)](https://github.com/ZeiszOtto/bb84-simulator/actions/workflows/test.yml)

An interactive, step-by-step simulator of the BB84 quantum key distribution
protocol, with an optional eavesdropper. Follow every photon from Alice to Bob,
change any bit or basis by hand, and watch an intercept-resend attack show up
in the error rate.

Plain HTML, CSS and JavaScript: no dependencies, no build step, no server.
Open `index.html` and it runs.


## Features

- **Step by step.** The protocol is split into 8 steps. Move with the
  Previous / Next buttons, the ← → keys, or by clicking any step. Each step
  fills in its rows of the table and sends the photons along the channel.
- **An eavesdropper.** Switch Eve on and set the share of photons she
  intercepts (0–100%). The photons she changed are outlined on the channel
  and in the table.
- **Your own bits and bases.** Click a cell to flip Alice's bit, Alice's
  basis, Eve's basis or Bob's basis. Measurement results follow from the
  physics, so they are recomputed, never set by hand.
- **Reproducible runs.** Every run comes from a seed. The same seed and
  settings always give the same run, so an interesting case can be shown
  again.
- **Error rate and decision.** A QBER bar against the threshold, the two
  final keys side by side, and a note when an error slipped past the check
  into the key.
- **Adjustable.** 8–32 photons, a QBER threshold of 5–25%.
- **English and Hungarian.** Switch the language in the header. The page
  starts in the browser's language; `index.html?lang=hu` opens it in
  Hungarian.


## How BB84 works

Alice sends single photons. Each one carries a random bit, encoded in one of
two randomly chosen bases:

| Basis            | bit 0    | bit 1     |
| ---------------- | -------- | --------- |
| `+` rectilinear  | `—` 0°   | `\|` 90°  |
| `×` diagonal     | `/` 45°  | `\` 135°  |

Bob measures each photon in a basis he picks at random. If he picks Alice's
basis, he reads her bit with certainty. If not, he gets a random bit.

Then they talk over a public channel. They compare their bases (never the
bits) and keep only the positions where the bases matched; this is called
sifting. Half of the kept bits are revealed to estimate the error rate
(QBER). If it reaches the threshold, they assume someone was listening and
throw the key away. Otherwise the bits that were not revealed become the
shared key.


**Why this catches an eavesdropper.** A photon cannot be copied (no-cloning
theorem), so Eve has to measure it and send Bob a new one. She guesses the
wrong basis half of the time, and the photon she then resends gives Bob a
wrong bit half of the time. On the sifted photons she intercepted, that is an
error rate of 25%, so the expected QBER is *interception rate / 4*.

The 8 steps in the app:

| #   | In the app        | What happens                                               |
| --- | ----------------- | ---------------------------------------------------------- |
| 1   | Alice's bits      | Alice picks random bits                                    |
| 2   | Alice's bases     | Alice picks random bases and sends the photons             |
| 3   | Eve's measurement | Eve intercepts, measures and resends (skipped without Eve) |
| 4   | Bob's bases       | Bob picks random measurement bases                         |
| 5   | Bob's measurement | Bob measures the photons                                   |
| 6   | Basis comparison  | The bases are compared in public; mismatches are dropped   |
| 7   | Error check       | Half of the sifted bits are compared; this gives the QBER  |
| 8   | Decision          | The key is accepted or discarded                           |


## Running it

1. Download the repository (**Code → Download ZIP**) or clone it.
2. Extract the ZIP.
3. Open `index.html` in a modern browser.

No installation and no internet connection are needed. Extract the ZIP first:
if you open `index.html` from inside it on Windows, only that one file is
extracted, and the page loads without its styles and scripts.


## Tests

The tests need Node.js 20 or newer. There is nothing to install.

```sh
npm test        # or: node --test
```

The 84 tests use Node's built-in test runner (`node:test`):

- **Unit tests** of the protocol, the random generator and the UI helpers.
  They run without a browser.
- **A regression test** that pins the demo run, so accidental
  changes show up.
- **Rule tests**: properties checked on 150 runs with different seeds and
  settings, for example "no errors without an interception".
- **Statistical tests** on 100 000 photons, for example that the error rate
  is *interception rate / 4* within four standard deviations.

## Limitations

- The channel is ideal: without Eve there is no noise or photon loss, so
  every error comes from her.
- Eve only uses the intercept-resend attack.
- There is no error correction or privacy amplification. Errors that the
  sample missed stay in the key; the app points them out.
- With few photons the check is weak. With 12 photons and full interception,
  the key is discarded for about 58% of seeds; with 32 photons, for about
  86%. Real BB84 behaves the same way, which is why real systems use many
  photons.