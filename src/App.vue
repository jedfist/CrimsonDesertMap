<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <header>
    <h1>Crimson Desert Map</h1>
    <nav>
      <RouterLink to="/">Home</RouterLink>
      <RouterLink to="/about">About</RouterLink>
    </nav>
  </header>

  <RouterView />
</template>

<style scoped>
header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e0e0e0;
}

h1 {
  margin: 0 0 1rem;
  font-size: 1.5rem;
  font-weight: 600;
}

nav {
  display: flex;
  gap: 1rem;
}

nav a {
  color: #42b883;
  text-decoration: none;
}

nav a.router-link-exact-active {
  font-weight: 600;
  text-decoration: underline;
}
</style>
