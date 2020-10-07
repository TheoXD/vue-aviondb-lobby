import Vue from 'vue'
import VueRouter, { RouteConfig } from 'vue-router'
import MainView from '../views/MainView.vue'

import { IonicVueRouter } from "@ionic/vue";

Vue.use(IonicVueRouter);

export default new IonicVueRouter({
  mode: "history",
  /* base: process.env.BASE_URL, */
  base: window.location.pathName,

  routes: [
    {
      path: "*",
      name: "main",
      meta: {
        showModal: false,
        isLobbyMaster: true,
      },
      component: MainView,
      children: [
        {
          path: ":multiHash",
          props: true,
          meta: {
            showModal: true
          },
          component: MainView
        }
      ],
    }
  ]
});