<script setup lang="ts">
import PreviewWindow from './PreviewWindow.vue';
import { useDemo } from './useDemo';

defineProps<{ active: boolean }>();

const { sent, score, delivered, isSpam, initials } = useDemo();
</script>

<template>
  <PreviewWindow kind="discord" :active="active" label="Mock Discord channel" owner="Your Discord">
    <template #title>form-submissions</template>
    <div class="dc">
      <p v-if="!delivered" class="dc-empty">
        {{ isSpam ? 'Still quiet. Spam doesn’t get a ping.' : 'Quiet in here. For now.' }}
      </p>
      <article v-if="delivered && sent" class="dc-msg arrived">
        <span class="dc-avatar" aria-hidden="true">m8</span>
        <div class="dc-body">
          <p class="dc-author">sendm8 <span class="dc-app">APP</span> <span class="dc-time">Today at {{ sent.at }}</span></p>
          <div class="dc-embed">
            <p class="dc-embed-title">New submission · Demo form</p>
            <div class="dc-fields">
              <div><p class="dc-k">name</p><p class="dc-v">{{ sent.name }}</p></div>
              <div><p class="dc-k">email</p><p class="dc-v dc-link">{{ sent.email }}</p></div>
              <div class="dc-wide"><p class="dc-k">message</p><p class="dc-v">{{ sent.message }}</p></div>
            </div>
            <p class="dc-foot"><span class="dc-foot-avatar">{{ initials }}</span> {{ sent.tracking }} · spam score {{ score.toFixed(2) }}</p>
          </div>
        </div>
      </article>
    </div>
  </PreviewWindow>
</template>

<style scoped>
.dc {
  flex: 1;
  padding: 1rem;
  background: #313338;
  color: #dbdee1;
  font-size: var(--fs-sm);
}
.dc-empty {
  color: #949ba4;
  padding-top: 0.6rem;
}
.dc-msg {
  display: grid;
  grid-template-columns: 2.5rem minmax(0, 1fr);
  gap: 0.8rem;
}
.dc-avatar {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: var(--red-500);
  color: #fff8ee;
  font-family: var(--font-display);
  font-stretch: 75%;
  font-weight: 900;
  font-size: 0.95rem;
}
.dc-author {
  font-weight: 600;
  color: #f2f3f5;
}
.dc-app {
  display: inline-block;
  margin-left: 0.2rem;
  padding: 0 0.3rem;
  border-radius: 3px;
  background: #5865f2;
  color: #fff;
  font-size: 0.625rem;
  vertical-align: 0.15em;
}
.dc-time {
  margin-left: 0.3rem;
  color: #949ba4;
  font-size: 0.75rem;
  font-weight: 400;
}
.dc-embed {
  margin-top: 0.4rem;
  padding: 0.7rem 0.9rem 0.8rem;
  max-width: 30rem;
  border-left: 4px solid var(--red-500);
  border-radius: 4px;
  background: #2b2d31;
}
.dc-embed-title {
  font-weight: 700;
  color: #f2f3f5;
}
.dc-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem 1rem;
  margin-top: 0.55rem;
}
.dc-wide {
  grid-column: 1 / -1;
}
.dc-k {
  font-size: 0.75rem;
  font-weight: 700;
  color: #f2f3f5;
}
.dc-v {
  font-size: 0.85rem;
  overflow-wrap: anywhere;
}
.dc-link {
  color: #00a8fc;
}
.dc-foot {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.7rem;
  font-size: 0.72rem;
  color: #949ba4;
}
.dc-foot-avatar {
  display: grid;
  place-items: center;
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 50%;
  background: #4e5058;
  color: #fff;
  font-size: 0.5rem;
  font-weight: 700;
}
.arrived {
  animation: arrive 520ms var(--ease-out) both;
}
@keyframes arrive {
  from {
    opacity: 0;
    transform: translateY(-14px);
    clip-path: inset(0 0 100% 0);
  }
  to {
    opacity: 1;
    transform: none;
    clip-path: inset(0 0 0 0);
  }
}

@media (max-width: 760px) {
  .dc-fields {
    grid-template-columns: 1fr;
  }
}
</style>
