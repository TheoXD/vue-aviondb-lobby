<template>
  <div class="home">
    <ion-button v-if="!isModalVisible" :disabled="isLoading" @click="createLobby">
      <ion-spinner v-if="isLoading" name="bubbles"></ion-spinner>
      <p>Create Lobby</p>
      </ion-button>
  </div>
</template>

<script lang="ts">

import { Component, Watch, Vue } from 'vue-property-decorator';

import Modal from "@/components/Modal.vue";

import IPFS from "ipfs";


//Known relays
const nodeList = [
  //"/dnsaddr/node1.dappkit.io/tcp/6969/wss/p2p/QmfLwmXF25u1n5pD8yXcbmZew3td66qPU1FroWNrkxS4bt", //faulty relay, will get skipped after a failed attempt
  "/dns4/ams-1.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLer265NRgSp2LA3dPaeykiS1J6DifTC88f5uVQKNAd",
  "/dns4/sgp-1.bootstrap.libp2p.io/tcp/443/wss/p2p/QmSoLSafTMBsPKadTEgaXctDQVcqN88CNLHXMkTNwMKPnu",
  "/dns4/node2.preload.ipfs.io/tcp/443/wss/p2p/QmV7gnbW5VTcJ3oyM2Xk1rdFBJ3kTkvxc87UFGsun29STS",
  "/dns4/node3.preload.ipfs.io/tcp/443/wss/p2p/QmY7JB6MQXhxHvq7dBDh4HpbH29v4yE9JRadAVpndvzySN",
  "/dns4/lon-1.bootstrap.libp2p.io/tcp/443/wss/p2p/QmSoLMeWqB7YGVLJN3pNLQpmmEk35v6wYtsMGLzSr5QBU3",
  "/dns4/sfo-3.bootstrap.libp2p.io/tcp/443/wss/p2p/QmSoLPppuBtQSGwKDZT2M73ULpjvfd3aZ6ha4oFGL1KrGM",
  "/dns4/nyc-1.bootstrap.libp2p.io/tcp/443/wss/p2p/QmSoLueR4xBeUbY9WZ9xGUUxunbKWcrNFTDAadQJmocnWm",
  "/dns4/nyc-2.bootstrap.libp2p.io/tcp/443/wss/p2p/QmSoLV4Bbm51jM9C4gDYZQ9Cy3U6aXMJDAbzgu2fzaDs64",
]

@Component({
  components: {}
})
export default class Main extends Vue {
  private isModalVisible: boolean = false;
  private showModal!: boolean;
  private ipfs!: IPFS;

  private peers: Set<string> = new Set<string>();

  private isLobbyMaster: boolean = false;
  private isLoading: boolean = false;
  private ownMultiHash!: string;
  private connectionAttempts = 0;
  private unsuccessfulConnectionAttempts = 0;
  private isConnectingToSwarm = false;
  

  constructor() {
    super();

    console.info("constructor");
  }

  /**
   * This creates an ipfs instance and retreives our own multiHash address.
   */
  async createIPFS(): Promise<IPFS> {
    console.info("createIPFS()");

    const ipfs = await IPFS.create({
      preload: { enabled: false },
      repo: Math.random().toString(36).substring(7),
      relay: { enabled: true, hop: { enabled: true, active: true } },
    });
    return ipfs;
  }

  /**
   * Lobby master clicked a button to create a lobby.
   * It creates an ipfs instance, retreives own multiHash and pushed it to the router path.
   */
  async createLobby() {
    console.info("createLobby()");
    this.isLoading = true;

    const ipfs = await this.connectToSwarm(0);

    const id = await ipfs.id();
    this.ownMultiHash = id.id;
    
    this.$router.push({
      path: '/' + this.ownMultiHash
    });

    this.openModal(ipfs, this.ownMultiHash);
  }

  /**
   * Connect to a public relay before attempting a connection between peers.
   */
  async connectToSwarm(offset: number): Promise<IPFS> {
    console.info("connectToSwarm()");
    const ipfs = await this.createIPFS();
    try {
      await ipfs.swarm.connect(
        nodeList[(this.connectionAttempts + offset) % nodeList.length]
      );
    }
    catch(err) {
      console.error(err);
      this.connectionAttempts += 1;
      await new Promise(r => setTimeout(r, 1000)); //Wait between attempts
    }


    //const myId = await this.ipfs.id();
    //this.ownMultiHash = myId.id;
    //console.info("this.ownMultiHash");
    //console.info(this.ownMultiHash);
    
    
    return ipfs;
  }

  async pingPeer(ipfs: IPFS, multiAddr: string): Promise<number> {
    console.info( `pingPeer(ipfs, ${multiAddr})` );
    return new Promise<number>((resolve, reject) => {
      try {
      ipfs.libp2p.ping(multiAddr, (err, ping) => {
          if (err) {
            console.error(err);
            reject(err);
          }

          ping.on('ping', async (timeMs: number) => {
            resolve(timeMs);
            ping.stop()
          })

          ping.start()
        });
      }
      catch(err) {
        console.error(err);
      }
    });
  }

  async tryToConnectToPeer(ipfs: IPFS, multiAddr: string, maxAttempts: number, waitTime: number, callback: () => any): Promise<boolean> {
      var success = false;
      try {
          await ipfs.swarm.connect(multiAddr);
          success = true;
      }
      catch(err) {
          console.error(err);
          this.unsuccessfulConnectionAttempts += 1;
          console.info(`unsuccessful attempts: ${this.unsuccessfulConnectionAttempts}`);

          if (this.unsuccessfulConnectionAttempts >= maxAttempts) {

            this.$ionic.toastController
            .create({
              message: `[Err] Unable to connect to lobby master after ${this.unsuccessfulConnectionAttempts} attempts.`,
              duration: waitTime,
              position: "bottom",
              showCloseButton: true,
              color: "danger"
            })
            .then(toast => {
              toast.present();
              setTimeout(async () => {

              }, waitTime) 
              success = false;
            });

          }
          else {
            await callback();
          }
    }
    return success;
  }

  /**
   * Here we try to connect to the peer using circuit relay.
   */
  async connectToPeer(ipfs: IPFS, multiHash: string): Promise<boolean> {
    console.log("Connecting....");
    var connected = false;
    const multiAddr = "/p2p-circuit/ipfs/" + multiHash;

    const ms = await this.pingPeer(ipfs, multiAddr);
    console.info(`ping: ${ms} ms` );

    if (ms) {
      const connected = await this.tryToConnectToPeer(ipfs, multiAddr, 3, 3000, async () => {
          await ipfs.stop();
          await new Promise(r => setTimeout(r, 1000)); //Wait between attempts
          this.joinLobby(multiHash);
      });

      return connected;
    }

    return connected;
  }

  /**
   * Gets called if router path contains multiHash.
   */
  async joinLobby(multiHash: string) {
    console.info("joinLobby()");
    const ipfs = await this.connectToSwarm(1);

    const id = await ipfs.id();
    this.ownMultiHash = id.id;

    setTimeout(async () => {
      const connected = await this.connectToPeer(ipfs, multiHash);
      if (connected) {
        this.openModal(ipfs, multiHash);
      }
    }, 2000);
  }


  /**
   * If router contains multiHash - assume client role and join the lobby.
   * If not - assume master role (by clicking a button)
   */
  @Watch("$route", { immediate: true })
  async onChildChanged(newRoute: Record<string, any>, oldRoute: Record<string, any>) {
    console.info(oldRoute);
    const showModal = newRoute.meta && newRoute.meta.showModal;
    const isLobbyMaster = oldRoute && oldRoute.meta && oldRoute.meta.isLobbyMaster;
    const multiHash = newRoute.params.multiHash;

    //TODO: make sure the multihash is a valid ipfs address.
    if (showModal && !isLobbyMaster && this.ownMultiHash != multiHash) {
      await this.joinLobby(multiHash);
    }
  }

  /**
   * Opens up the popup window component where AvionDB stuff is.
   */
  openModal(ipfs: IPFS, multiHash: string) {
    console.info( `openModal(ipfs, ${multiHash})` );
    console.info(this.ownMultiHash);
    console.info(multiHash);
    return this.$ionic.modalController
      .create({
        component: Modal,
        componentProps: {
          data: {
            
          },
          propsData: {
            multiHash: multiHash,
            isLobbyMaster: multiHash === this.ownMultiHash,
            ipfs: ipfs,
            router: this.$router,
            route: this.$route
          }
        }
      })
      .then(m => {
        m.onDidDismiss().then(async () => {
          //this.$router.back();
          console.info("onDidDismiss");
          await ipfs.stop();
          this.$router.push({
            path: `/`
          });
          this.isModalVisible = false;
        });

        m.present();
        this.isLoading = false;
        this.isModalVisible = true;
        this.$emit("DONE_LOADING");
      });
  }
}
</script>
