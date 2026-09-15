<script setup lang="ts">
import ParcelTicket from './ParcelTicket.vue';
import { useDemo } from './useDemo';

const { stage, tracking, receivedAt, shownScore, reasons, reached, progress, isSpam } = useDemo();
</script>

<template>
  <ol class="track" role="list" :style="{ '--progress': progress }">
    <li class="station" :class="{ on: reached('received') }">
      <span class="station-dot" aria-hidden="true"></span>
      <p class="label station-no">01</p>
      <h3 class="station-name">Received</h3>
      <p class="station-detail mono">{{ reached('received') ? `${tracking} · ${receivedAt}` : 'POST /f/demo' }}</p>
      <span v-if="reached('received')" class="stamp stamp-ink station-stamp" style="--stamp-rotate: -7deg">In</span>
    </li>
    <li class="station" :class="{ on: reached('checked'), bad: isSpam }">
      <span class="station-dot" aria-hidden="true"></span>
      <p class="label station-no">02</p>
      <h3 class="station-name">Spam-checked</h3>
      <div class="station-detail">
        <div class="score" :class="{ high: shownScore >= 0.5 }" :style="{ '--score': shownScore }">
          <span class="score-bar" aria-hidden="true"></span>
          <span class="mono">score {{ shownScore.toFixed(2) }}</span>
        </div>
        <ul v-if="isSpam && reasons.length" class="reasons" role="list">
          <li v-for="r in reasons" :key="r">{{ r }}</li>
        </ul>
      </div>
      <span v-if="reached('checked') && !isSpam && stage !== 'checked'" class="stamp stamp-ok station-stamp" style="--stamp-rotate: 5deg">Clean</span>
      <span v-if="isSpam" class="stamp stamp-lg station-stamp station-stamp-spam" style="--stamp-rotate: -9deg">Return to sender</span>
    </li>
    <li class="station" :class="{ on: reached('stored'), muted: isSpam }">
      <span class="station-dot" aria-hidden="true"></span>
      <p class="label station-no">03</p>
      <h3 class="station-name">Stored</h3>
      <p class="station-detail mono">{{ isSpam ? 'Filed under spam for 30 days' : reached('stored') ? 'Filed in your dashboard inbox' : 'Dashboard inbox' }}</p>
      <span v-if="reached('stored')" class="stamp stamp-ink station-stamp" style="--stamp-rotate: -3deg">Filed</span>
    </li>
    <li class="station" :class="{ on: reached('delivered'), muted: isSpam }">
      <span class="station-dot" aria-hidden="true"></span>
      <p class="label station-no">04</p>
      <h3 class="station-name">Delivered</h3>
      <p class="station-detail mono">{{ isSpam ? 'Not delivered. Good.' : 'Email · Discord' }}</p>
      <span v-if="reached('delivered')" class="stamp station-stamp" style="--stamp-rotate: 8deg">Delivered</span>
    </li>
    <ParcelTicket :tracking="tracking" :show="stage !== 'idle'" :spam="isSpam" />
  </ol>
</template>

<style scoped>
.track {
  --progress: 0;
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--s-4);
  margin-top: var(--s-6);
  padding-top: 2.2rem;
  list-style: none;
  padding-left: 0;
}
/* the conveyor: hairline, then a drawn line on top */
.track::before,
.track::after {
  content: '';
  position: absolute;
  top: 0.55rem;
  left: 0.55rem;
  right: 0;
  height: 3px;
}
.track::before {
  background: repeating-linear-gradient(90deg, var(--line) 0 10px, transparent 10px 16px);
}
.track::after {
  background: var(--signal);
  transform-origin: left;
  transform: scaleX(var(--progress));
  transition: transform 800ms var(--ease-out);
}
.station {
  position: relative;
  min-width: 0;
  padding-right: var(--s-3);
  transition: opacity var(--dur-3);
}
.station.muted {
  opacity: 0.38;
}
.station-dot {
  position: absolute;
  top: -2.2rem;
  left: 0;
  width: 1.4rem;
  height: 1.4rem;
  border: 3px solid var(--fg-muted);
  background: var(--bg);
  border-radius: 50%;
  z-index: 1;
  transition:
    border-color var(--dur-2),
    background var(--dur-2);
}
.station.on .station-dot {
  border-color: var(--signal);
  background: var(--signal);
}
.station-no {
  color: var(--fg-muted);
}
.station-name {
  margin-top: 0.2rem;
  font-family: var(--font-display);
  font-stretch: var(--stretch-condensed);
  font-weight: 900;
  font-size: clamp(1.7rem, 3vw, 2.6rem);
  line-height: 0.95;
  color: var(--fg-muted);
  transition: color var(--dur-2);
}
.station.on .station-name {
  color: var(--fg);
}
.station-detail {
  margin-top: var(--s-2);
  font-size: var(--fs-xs);
  color: var(--fg-muted);
  overflow-wrap: anywhere;
}
.station-stamp {
  position: absolute;
  top: -0.2rem;
  right: 0.5rem;
  animation: thunk 380ms var(--ease-thunk) both;
  pointer-events: none;
}
.station-stamp-spam {
  top: auto;
  right: auto;
  left: 45%;
  bottom: -2.6rem;
  z-index: 3;
  --stamp-color: var(--signal);
  box-shadow:
    inset 0 0 0 3px var(--bg),
    inset 0 0 0 5.5px var(--stamp-color);
}
@keyframes thunk {
  0% {
    transform: scale(2.3) rotate(calc(var(--stamp-rotate) - 12deg));
    opacity: 0;
  }
  55% {
    transform: scale(0.92) rotate(var(--stamp-rotate));
    opacity: 1;
  }
  100% {
    transform: scale(1) rotate(var(--stamp-rotate));
  }
}
.score {
  --score: 0;
  display: grid;
  gap: 0.3rem;
}
.score-bar {
  position: relative;
  height: 8px;
  max-width: 10rem;
  border: 1px solid var(--fg-muted);
}
.score-bar::after {
  content: '';
  position: absolute;
  inset: 1px auto 1px 1px;
  width: calc(var(--score) * (100% - 2px));
  background: var(--ok);
}
.score.high .score-bar::after {
  background: var(--signal);
}
.reasons {
  margin-top: var(--s-2);
  display: grid;
  gap: 0.2rem;
  color: var(--signal-text);
  font-family: var(--font-mono);
}
.reasons li::before {
  content: '✕ ';
}

@media (max-width: 760px) {
  .track {
    grid-template-columns: 1fr;
    gap: var(--s-5);
    padding-top: 0;
    padding-left: 2.6rem;
  }
  .track::before,
  .track::after {
    top: 0.5rem;
    bottom: 1rem;
    left: 0.6rem;
    right: auto;
    width: 3px;
    height: auto;
  }
  .track::before {
    background: repeating-linear-gradient(180deg, var(--line) 0 10px, transparent 10px 16px);
  }
  .track::after {
    transform-origin: top;
    transform: scaleY(var(--progress));
  }
  .station-dot {
    top: 0.1rem;
    left: -2.6rem;
  }
  .station-stamp {
    top: 0.4rem;
    right: 0;
  }
  .station-stamp-spam {
    position: relative;
    left: 0;
    bottom: 0;
    margin: var(--s-4) 0 var(--s-5);
  }
}
</style>
