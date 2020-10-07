<template>
  <div class="modal">
    <ion-header>
      <ion-toolbar color="warning">
        <ion-title>Modal</ion-title>

        <ion-buttons slot="end">
          <ion-button @click="dismissModal">
            <ion-icon name="undo"></ion-icon>Back
          </ion-button>
        </ion-buttons>
        <div class="Space" slot="start"></div>
        <ion-icon name="logo-github" slot="start" size="large"></ion-icon>
      </ion-toolbar>
    </ion-header>
    <ion-content ref="content" color="tertiary" :scrollEvents="true" class="CustomContent">
      <ion-grid>
        <ion-row class="ion-align-items-center">
          <ion-col  class="ion-align-self-center" size="6">
                <QRCodeComponent
                  :url="'/' + multiHash
                  "
                  :key="isLobbyMaster"
                />
          </ion-col>
        </ion-row>
      </ion-grid>
    </ion-content>
  </div>
</template>

<script lang="ts">
/*eslint no-unused-vars: "warn"*/

import { Component, Prop, Vue } from 'vue-property-decorator';

import VueRouter from "vue-router";

import Route from "vue-router";

import QRCodeComponent from "@/components/QRCodeComponent.vue";


import IPFS from "ipfs";

import {
  Peer
} from "../types";

@Component({
  components: {
    QRCodeComponent
  }
})
export default class Modal extends Vue {
  @Prop() private multiHash!: string;
  @Prop() private ipfs!: IPFS;

  @Prop() private router!: VueRouter;
  @Prop() private route!: Route;

  @Prop() private isLobbyMaster!: boolean;

  private publishInterval!: NodeJS.Timeout;
  private refreshInterval!: NodeJS.Timeout;

  private dbName!: string;
  private collectionName!: string;
  private peerCollectionName!: string;
  private peers: Set<string> = new Set<string>();

  /* AvionDB */
  private aviondb!: any;
  private collection!: any;
  private peerCollection!: any;


  constructor() {
    super();

    if (this.isLobbyMaster) {
        this.createLobby(this.multiHash);
    } else {
        //Wait for master to send lobby info so that clients can join
        this.startSubscribe(this.multiHash);
    }
  }


  async startPublish(inDbAddr: any, collectionName: string) {
    console.info( `startPublish(${inDbAddr} , ${collectionName})` );

    this.publishInterval = setInterval(async () => {
      const id = await this.ipfs.id();
      console.info("broadcasting:");
      await this.broadcastLobbyInfo(inDbAddr, collectionName);
    }, 5000);
  }
  

  async broadcastLobbyInfo(dbAddr: string, collectionName: string) {
    console.info( `broadcastLobbyInfo(${dbAddr} , ${collectionName})` );

    await this.ipfs.pubsub.publish(
      this.multiHash,
      Buffer.from(
        JSON.stringify({
          dbAddr: dbAddr,
          collectionName: collectionName,
        })
      )
    );
  }

  async startRefreshing() {
    if (!this.refreshInterval) {
      this.refreshInterval = setInterval(async () => {
        console.info("refreshing...");
        //const peers = await this.peerCollection.find({});
        //console.info(peers);

        if (this.collection) {
          const connection = await this.collection.find({});
          console.info(connection);
        }
        else {
          console.info("this.collection = undefined");
        }
      }, 2000);
    }
  }

  async startSubscribe(multiHash: string) {
   console.info( `startSubscribe( ${multiHash})` );

    await this.ipfs.pubsub.subscribe(multiHash, async (msg: any) => {
      console.info("P2P MESSAGE RECEIVED");

      const lobbyInfo = JSON.parse(msg.data.toString());
      console.info(lobbyInfo);

      if (Object.prototype.hasOwnProperty.call(lobbyInfo, "dbAddr") && Object.prototype.hasOwnProperty.call(lobbyInfo, "collectionName")) {
        if (this.dbName != lobbyInfo.dbAddr || this.collectionName != lobbyInfo.collectionName) {
          //Stop receiving new broadcast messages until we're done with the current one
          await this.stopSubscribe(this.multiHash);

          try {
            await this.joinLobby(lobbyInfo.dbAddr, lobbyInfo.collectionName);
          }
          catch (err) {
            console.error(err);
          }

          await this.startRefreshing();

          await this.startSubscribe(this.multiHash);
        }
      }

      if (Object.prototype.hasOwnProperty.call(lobbyInfo, "dbAddr")) {
        this.dbName = lobbyInfo.dbAddr;
      }

      if (Object.prototype.hasOwnProperty.call(lobbyInfo, "collectionName")) {
        this.collectionName = lobbyInfo.collectionName;
      }

    });
  }
  

  async stopPublish() {
    console.info( `stopPublish()` );
    if (this.publishInterval) {
      clearInterval(this.publishInterval);
    }
  }

  async stopSubscribe(multiHash: string) {
    console.info( `stopSubscribe( ${multiHash})` );
    const topics: Array<string> = await this.ipfs.pubsub.ls();
    topics.map(async e => {
      await this.ipfs.pubsub.unsubscribe(e);
    });

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  async createLobby(multiHash: string) {
    console.info( `createLobby(${multiHash})` );

    const dbName = "com-" + multiHash + "-db";
    const collectionName = "com-" + multiHash + "-collection";
    const peerCollectionName = this.collectionName + "-peers";

    const aviondb = await this.initAvionDB(dbName);

    if (aviondb) {
      const collection = await this.initAvionCollection(aviondb, collectionName);
      //const peerCollection = await this.initAvionCollection(aviondb, peerCollectionName);

      //this.peerCollection = peerCollection;
      this.collection = collection;
      this.aviondb = aviondb;

      /*
      await this.collection.insertOne({
        multiHash: multiHash,
      } as Peer);
      */

      console.info("Local copy:");
      const connection = await this.collection.find({});
      console.info(connection);
      
      await this.startPublish(
        this.aviondb.id,
        this.collection.dbname
      );
    }
  }

  async joinLobby(dbAddr: string, collectionName: string) {
    console.info( `joinLobby(${dbAddr}, ${collectionName})` );

    const peerCollectionName = collectionName + "-peers";

    if (!this.aviondb) {
      const aviondb = await this.openAvionDB(dbAddr);
      this.aviondb = aviondb;
    }

    if (this.aviondb) {
      console.info("got aviodb");
      console.info(this.aviondb);

      //const collections = await this.aviondb.listCollections();
      
      if(!this.collection) {
          this.collection = await this.openAvionCollection(this.aviondb, collectionName);
      }
      
      /*
      if(!this.peerCollection) {
          this.peerCollection = await this.initAvionCollection(this.aviondb, peerCollectionName);
      }
      */
    }
  }

  async initAvionCollection(aviondb: any, collectionName: string): Promise<any> {
    console.info( `initAvionCollection( aviondb, ${collectionName})` );
    const collection = await aviondb.initCollection(collectionName);
    return collection;
  }

  async openAvionCollection(aviondb: any, collectionName: string): Promise<any> {
    console.info( `openAvionCollection( aviondb, ${collectionName})` );
    const collection = await aviondb.initCollection(collectionName); //NOTE: Init rather than open
    return collection;
  }

  async initAvionDB(dbName: string): Promise<any> {
    console.info( `initAvionDB( ${dbName})` );
    const aviondb = await window.AvionDB.init(dbName, this.ipfs);
    return aviondb;
  }

  async openAvionDB(dbName: string): Promise<any> {
    console.info( `openAvionDB( ${dbName})` );
    const aviondb = await window.AvionDB.open(dbName, this.ipfs);
    return aviondb;
  }

  async dismissModal() {
    if (this.ipfs) {
      if (this.isLobbyMaster) {
        this.stopPublish();
      }
      else {
        this.stopSubscribe(this.multiHash);
      }

      if (this.collection) {
        this.collection.close();
      }

      if (this.peerCollection) {
        this.peerCollection.close();
      }

      if (this.aviondb) {
        console.info("Dropping tmp database");
        await this.aviondb.drop();
        await this.aviondb.close(); // Closes all collections and binding database.
      }
    }
    
    this.$ionic.modalController.dismiss();
  }
}
</script>

<style scoped>
h3 {
  margin: 40px 0 0;
}
ul {
  list-style-type: none;
  padding: 0;
}
li {
  display: inline-block;
  margin: 0 10px;
}
a {
  color: #42b983;
}

ion-content.CustomContent {
    display: flex;
    align-items: center;
    justify-content: center;
}
</style>
