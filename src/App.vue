<template>
  <div id="app" class="ion-page">

    <ion-header transluent="true">
      <ion-toolbar>
        <ion-title>AvionDB Lobby</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="SideBar" color="dark">
      <ion-vue-router @ionRouteDidChange="onRouteChanged" main />
    </ion-content>

  </div>
</template>

<script lang="ts">
import { Component, Vue } from "vue-property-decorator";

@Component({
  components: {
  }
})
export default class App extends Vue {
  constructor() {
    super();
  }

  onRouteChanged(newRoute: any) {
    console.info("Route did change to " + newRoute);
  }
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  background: none;
}

#nav {
  padding: 30px;
}

#nav a {
  font-weight: bold;
  color: #2c3e50;
}

#nav a.router-link-exact-active {
  color: #42b983;
}
</style>
