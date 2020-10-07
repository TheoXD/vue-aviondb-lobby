<template>
  <div class="QRContainer">
    <canvas ref="qrcodecanvas" />
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';

// eslint-disable-next-line no-unused-vars
import { QRCode, QRCodeRenderersOptions, toCanvas } from "qrcode";

@Component({
  components: {}
})
export default class QRCodeComponent extends Vue {
  @Prop() private url!: string;

  constructor() {
    super();
  }

  mounted() {
    if (this.url) {
      const opts = {
        errorCorrectionLevel: "H",
        width: 240,
        height: 240,
        margin: 1
      } as QRCodeRenderersOptions;


      toCanvas(
        this.$refs.qrcodecanvas,
        window.location.origin + this.url,
        opts
      ).then(res => {
        console.info("QRCode created");
        console.info(res);
      });
    }
  }

  /*
  gotURL() {
    const opts = {
      errorCorrectionLevel: 'H',
      width: 100,
      height: 100,
      margin: 1,
      
    } as QRCodeRenderersOptions;

    console.info("URL:");
    console.info(this.url);

    toCanvas(this.$refs.qrcodecanvas, this.url, opts).then((res) => {
        console.info("QRCode created");
        console.info(this.url);
    });
  }
  */
}
</script>

<style scoped>
div.QRContainer {
  height: auto;
  width: auto;
  padding: 0.2em;
  display: inline-flex;
  background: #ffffff3d;
}
</style>
