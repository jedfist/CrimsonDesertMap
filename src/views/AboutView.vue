<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useCounterStore } from '../stores/counter'

const counter = useCounterStore()
const { count } = storeToRefs(counter)
</script>

<template>
  <div class="about">
    <h1>This is an about page</h1>
    <p>Pinia demo: count is {{ count }}</p>
    <button type="button" @click="counter.increment()">Increment</button>
  </div>
</template>

<style scoped>
.about {
  padding: 1rem 2rem;
}

button {
  margin-top: 0.5rem;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
}
</style>
