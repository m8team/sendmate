<script setup lang="ts">
import Icon from '../../ui/Icon.vue';
import PreviewWindow from './PreviewWindow.vue';
import { useDemo } from './useDemo';

defineProps<{ active: boolean }>();

const { sent, openEmail, delivered, isSpam } = useDemo();
</script>

<template>
  <PreviewWindow kind="email" :active="active" label="Mock email inbox" owner="Your email">
    <template #title>Inbox <b v-if="delivered">(1)</b></template>
    <div class="mail">
      <ul class="mail-list" role="list">
        <li v-if="delivered && sent" class="mail-row unread arrived" :class="{ open: openEmail }">
          <button type="button" class="mail-row-btn" :aria-expanded="openEmail" @click="openEmail = !openEmail">
            <span class="mail-from">sendm8</span>
            <span class="mail-subj"><b>New submission: Demo form</b> — {{ sent.message }}</span>
            <span class="mail-time mono">{{ sent.at }}</span>
          </button>
          <div v-if="openEmail" class="mail-open">
            <p class="mail-meta mono">From notify@sendm8.com · Reply-To {{ sent.email }}</p>
            <table class="mail-table">
              <tbody>
                <tr><th scope="row">name</th><td>{{ sent.name }}</td></tr>
                <tr><th scope="row">email</th><td>{{ sent.email }}</td></tr>
                <tr><th scope="row">message</th><td>{{ sent.message }}</td></tr>
              </tbody>
            </table>
            <p class="mail-foot mono">{{ sent.tracking }} · Hit reply to answer {{ sent.name.split(' ')[0] }} directly</p>
          </div>
        </li>
        <li v-if="!delivered" class="mail-empty">
          <Icon name="inbox" :size="22" />
          <span>{{ isSpam ? 'Nothing here. The bot didn’t make it past the sorting office.' : 'Nothing new yet. Go on, send something.' }}</span>
        </li>
        <li class="mail-row old"><span class="mail-from">Octopus Energy</span><span class="mail-subj">Your September statement is ready</span><span class="mail-time mono">09:12</span></li>
        <li class="mail-row old"><span class="mail-from">Mum</span><span class="mail-subj">Sunday lunch? Dad’s doing the lamb again</span><span class="mail-time mono">Sat</span></li>
      </ul>
    </div>
  </PreviewWindow>
</template>

<style scoped>
/* email: a light mail client in both themes, because most people's is */
.mail {
  flex: 1;
  background: #fbfaf7;
  color: #1d1c1a;
}
.mail-list {
  list-style: none;
  padding: 0;
}
.mail-row,
.mail-row-btn {
  display: grid;
  grid-template-columns: 7.5rem minmax(0, 1fr) auto;
  gap: var(--s-3);
  align-items: baseline;
  font-size: var(--fs-sm);
}
.mail-row {
  border-bottom: 1px solid #e6e2da;
}
.mail-row.old {
  padding: 0.7rem 0.9rem;
  color: #6f6a61;
}
.mail-row.unread {
  display: block;
  background: #fff;
  box-shadow: inset 4px 0 0 var(--red-500);
}
.mail-row-btn {
  width: 100%;
  padding: 0.75rem 0.9rem;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}
.mail-row-btn:hover {
  background: #f4f1ea;
}
.mail-from {
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mail-subj {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.mail-time {
  font-size: var(--fs-2xs);
  color: #6f6a61;
}
.mail-open {
  padding: 0 0.9rem 0.9rem 0.9rem;
}
.mail-meta,
.mail-foot {
  font-size: 0.6875rem;
  color: #6f6a61;
}
.mail-table {
  width: 100%;
  margin-block: 0.6rem;
  border-collapse: collapse;
  font-size: var(--fs-sm);
}
.mail-table th {
  width: 5.5rem;
  padding: 0.45rem 0.6rem;
  text-align: left;
  vertical-align: top;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 600;
  color: #6f6a61;
  background: #f4f1ea;
  border: 1px solid #e6e2da;
}
.mail-table td {
  padding: 0.45rem 0.6rem;
  border: 1px solid #e6e2da;
  overflow-wrap: anywhere;
}
.mail-empty {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: 1.6rem 0.9rem;
  color: #6f6a61;
  font-size: var(--fs-sm);
  border-bottom: 1px solid #e6e2da;
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
  .mail-row,
  .mail-row-btn {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .mail-subj {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
</style>
