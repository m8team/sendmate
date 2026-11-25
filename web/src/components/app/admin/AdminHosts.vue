<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { AdminHostsDto } from '@sendm8/shared';
import Icon from '../../ui/Icon.vue';
import { api } from '../../../lib/api/endpoints';
import { friendlyError } from '../../../lib/api/errors';

/**
 * Where forms are hosted: non-spam submissions and distinct forms by the referrer's host
 * (AI builders, static hosts, custom domains). Numbers to show the platforms we integrate with.
 */
const hosts = ref<AdminHostsDto | null>(null);
const loadError = ref('');

async function load() {
  loadError.value = '';
  try {
    hosts.value = await api.adminHosts();
  } catch (err) {
    loadError.value = friendlyError(err);
  }
}

const n = (value: number) => value.toLocaleString('en-GB');

onMounted(load);
</script>

<template>
  <section class="office-section" aria-labelledby="office-hosts">
    <div class="office-bar">
      <h2 id="office-hosts" class="office-title">Where forms are hosted</h2>
      <button type="button" class="btn btn-ghost btn-xs" @click="load"><Icon name="refresh" :size="14" /> Refresh</button>
    </div>

    <p v-if="loadError" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ loadError }}</p>
    <div v-else-if="!hosts" class="skel" style="height: 7rem" aria-hidden="true"></div>
    <div v-else class="table-wrap">
      <table class="table">
        <caption class="sr-only">Submissions and forms by where the form is hosted, excluding spam</caption>
        <thead>
          <tr>
            <th scope="col">Host</th>
            <th scope="col" class="num">Forms · 30d</th>
            <th scope="col" class="num">Submissions · 30d</th>
            <th scope="col" class="num">Forms · all time</th>
            <th scope="col" class="num">Submissions · all time</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in hosts.groups" :key="g.group" :class="{ muted: !g.submissions }">
            <th scope="row" class="hosts-name">{{ g.group }}</th>
            <td class="num tabular">{{ n(g.forms30d) }}</td>
            <td class="num tabular">{{ n(g.submissions30d) }}</td>
            <td class="num tabular">{{ n(g.forms) }}</td>
            <td class="num tabular">{{ n(g.submissions) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" class="hosts-name">Total</th>
            <td class="num tabular">{{ n(hosts.total.forms30d) }}</td>
            <td class="num tabular">{{ n(hosts.total.submissions30d) }}</td>
            <td class="num tabular">{{ n(hosts.total.forms) }}</td>
            <td class="num tabular">{{ n(hosts.total.submissions) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p v-if="hosts" class="hosts-note">From each submission’s referrer. Spam and unsolved challenges are left out. A form posted to from more than one host counts under each, so the form total is distinct forms, not the sum.</p>
  </section>
</template>

<style scoped src="./admin-section.css"></style>
<style scoped>
.hosts-name {
  font-weight: 500;
  text-align: left;
}
tfoot th,
tfoot td {
  font-weight: 600;
  border-top: 1px solid var(--line);
}
.hosts-note {
  margin-top: var(--s-2);
  font-size: var(--fs-xs);
  color: var(--fg-muted);
}
</style>
