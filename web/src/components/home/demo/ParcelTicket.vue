<script setup lang="ts">
/** The yellow tracking ticket that rides the sorting line (and falls off it for spam). Reads `--progress` from the track. */
defineProps<{
  tracking: string;
  show: boolean;
  spam: boolean;
}>();
</script>

<template>
  <li class="ticket" aria-hidden="true" :class="{ show, spam }">
    <span class="ticket-code mono">{{ tracking || 'SM8' }}</span>
  </li>
</template>

<style scoped>
.ticket {
  position: absolute;
  top: -0.45rem;
  left: 0;
  width: 100%;
  height: 0;
  pointer-events: none;
}
.ticket-code {
  position: absolute;
  left: calc(var(--progress) * (100% - 9rem));
  top: -1.35rem;
  padding: 0.15rem 0.45rem;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 0.6875rem;
  font-weight: 600;
  white-space: nowrap;
  opacity: 0;
  transform: translateY(-8px) rotate(-3deg);
  transition:
    left 800ms var(--ease-out),
    opacity var(--dur-2),
    transform var(--dur-3) var(--ease-thunk);
}
.ticket.show .ticket-code {
  opacity: 1;
  transform: rotate(-3deg);
}
.ticket.spam .ticket-code {
  background: var(--signal);
  color: var(--on-signal);
  transform: translateY(14px) rotate(14deg);
}

@media (max-width: 760px) {
  .ticket {
    display: none;
  }
}
</style>
