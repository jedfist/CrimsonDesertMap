<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="app">
    <header class="app__header">
      <img
        class="app__mark"
        src="/brand-mark.png"
        width="624"
        height="590"
        alt=""
        aria-hidden="true"
      />
      <div class="app__brand">
        <h1 class="app__title">
          <span class="app__title-accent">Crimson Desert</span>
          <span class="app__title-rest"> Interactive Map</span>
        </h1>
        <p class="app__tagline">World atlas</p>
      </div>
    </header>
    <div class="app__body">
      <RouterView />
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.app__body {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.app__header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1.25rem 0.55rem;
  border-bottom: 1px solid #2d2d32;
  background: #121214;
}

.app__mark {
  flex-shrink: 0;
  height: 3.65rem;
  width: auto;
  object-fit: contain;
  object-position: left center;
  display: block;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.4));
}

.app__brand {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding-left: 0.65rem;
  border-left: 3px solid #b91c3c;
}

.app__title {
  margin: 0;
  font-family: Cinzel, 'Times New Roman', serif;
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1.15;
}

.app__title-accent {
  color: #e8e6e3;
}

@supports ((-webkit-background-clip: text) or (background-clip: text)) {
  .app__title-accent {
    background: linear-gradient(180deg, #f5f0e8 0%, #c9c4bc 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
}

.app__title-rest {
  color: #9a9690;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.app__tagline {
  margin: 0;
  font-family: Cormorant Garamond, Georgia, serif;
  font-size: 0.8125rem;
  font-weight: 600;
  font-style: italic;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #6e6a63;
}
</style>
