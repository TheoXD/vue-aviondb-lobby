<template>
  <div class="modal">
    <ion-header>
      <ion-toolbar color="success">
        <div class="Space" slot="start"></div>
        <ion-icon name="create" v-if="isLobbyMaster" slot="start"></ion-icon>
        <ion-input
          :placeholder="lobbyData.title"
          :v-model="lobbyData.title"
          v-on:ionChange="lobbyTitleChanged"
          slot="start"
        ></ion-input>

        <ion-buttons slot="end">
          <ion-button @click="dismissModal">
            <ion-icon name="undo"></ion-icon>Close
          </ion-button>
        </ion-buttons>
        <div class="Space" slot="start"></div>
        <ion-icon name="logo-github" slot="start" size="large"></ion-icon>
      </ion-toolbar>
    </ion-header>
    <ion-content ref="content" color="dark" :scrollEvents="true" class="CustomContent">
      <div class="ProgressBarContainer">
        <ion-progress-bar color="secondary" type="indeterminate" v-if="isLoading"></ion-progress-bar>
      </div>
      <div class="Lobby">
      <ion-grid>
        <ion-row class="ion-align-items-center">
          <ion-col  class="ion-align-self-center" size="6">
                <QRCodeComponent
                  :url="'/' + multiHash
                  "
                  :key="isLobbyMaster"
                />
          </ion-col>
          <ion-col  class="ion-align-self-center">
        <ion-list>
          <ion-item
            class="Peer"
            v-for="peer in peers"
            :key="peer"
          ><ion-label>{{ peer.substring(0, 8) + "....." + peer.substring(38, 48) }}</ion-label></ion-item>
        </ion-list>
          </ion-col>
        </ion-row>
      </ion-grid>
      </div>
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
  Peer,
  MasterMessage,
  LobbyData
} from "../types";

import {
  create
} from "ionicons/icons";
import { addIcons } from "ionicons";

addIcons({
  "ios-create": create.ios,
  "md-create": create.md
});

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
  private lobbyInfo!: MasterMessage;

  /* AvionDB */
  private aviondb!: any;
  private collection!: any;
  private peerCollection!: any;
  private hasEvents!: boolean;
  private isLoading: boolean = true;

  private lobbyData: LobbyData = {
    title: "Lobby"
  }
  private lobbyId!: string;

  constructor() {
    super();

    if (this.isLobbyMaster) {
        this.createLobby(this.multiHash);
    } else {
        //Wait for master to send lobby info so that clients can join
        this.startSubscribe(this.multiHash);
    }
  }

  async lobbyTitleChanged(ev: CustomEvent) {
    this.lobbyData.title = ev.detail.value;

    if (this.isLobbyMaster) {
      await this.collection.findOneAndUpdate(
        {_id: this.lobbyId},
        { $set: { title: this.lobbyData.title  } }
      );
    }
  }

  async startPublish(inDbAddr: any, collectionName: string, lobbyId: string) {
    console.info( `startPublish(${inDbAddr} , ${collectionName}, ${lobbyId})` );

    this.publishInterval = setInterval(async () => {
      const id = await this.ipfs.id();
      console.info("broadcasting:");
      await this.broadcastLobbyInfo(inDbAddr, collectionName, lobbyId);
    }, 5000);
  }
  

  async broadcastLobbyInfo(dbAddr: string, collectionName: string, lobbyId: string) {
    console.info( `broadcastLobbyInfo(${dbAddr} , ${collectionName}, ${lobbyId})` );

    const headHash = await this.collection.getHeadHash();
    const peersHeadHash = await this.peerCollection.getHeadHash();

    await this.ipfs.pubsub.publish(
      this.multiHash,
      Buffer.from(
        JSON.stringify({
          dbAddr: dbAddr,
          collectionName: collectionName,
          headHash: headHash,
          peersHeadHash: peersHeadHash,
          lobbyId: lobbyId
        })
      )
    );
  }

  async startRefreshing() {
    console.info( `startRefreshing()` );
    if (!this.refreshInterval) {
      this.refreshInterval = setInterval(async () => {
        console.info("refreshing...");

        await this.joinLobby(this.dbName, this.collectionName);

        this.getPeers();

        //TODO: only when head hash is different
        if (this.collection) {
          console.info(this.lobbyId);
          const res = await this.collection.findOne({_id: this.lobbyId});
          console.info(res);

          if (res && Object.prototype.hasOwnProperty.call(res, "title")) {
            this.lobbyData.title = res.title;
          }
        }

      }, 2000);
    }
  }

  async startSubscribe(multiHash: string) {
   console.info( `startSubscribe( ${multiHash})` );

    await this.ipfs.pubsub.subscribe(multiHash, async (msg: any) => {
      console.info("P2P MESSAGE RECEIVED");

      const lobbyInfo: MasterMessage = JSON.parse(msg.data.toString());
      this.lobbyInfo = lobbyInfo;
      console.info(lobbyInfo);

      if (Object.prototype.hasOwnProperty.call(lobbyInfo, "lobbyId") && lobbyInfo.lobbyId != this.lobbyId) {
        this.lobbyId = lobbyInfo.lobbyId;
      }

      if (Object.prototype.hasOwnProperty.call(lobbyInfo, "dbAddr") && Object.prototype.hasOwnProperty.call(lobbyInfo, "collectionName")) {
        if (this.dbName != lobbyInfo.dbAddr || this.collectionName != lobbyInfo.collectionName) {
          //Stop receiving new broadcast messages until we're done with the current one
          await this.stopSubscribe(this.multiHash);

          await this.startRefreshing();

          await this.startSubscribe(this.multiHash);
        }
      }
      if (this.collection && this.peerCollection && Object.prototype.hasOwnProperty.call(lobbyInfo, "headHash") && Object.prototype.hasOwnProperty.call(lobbyInfo, "peersHeadHash")) {
        var localHeadHash = await this.collection.getHeadHash();
        var localPeerHeadHash = await this.peerCollection.getHeadHash();
          if (lobbyInfo.headHash != localHeadHash || lobbyInfo.peersHeadHash != localPeerHeadHash) {
            this.isLoading = true;
          }
          else {
            this.isLoading = false;
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
    const peerCollectionName = collectionName + "-peers";

    const aviondb = await this.initAvionDB(dbName);

    if (aviondb) {
      var insertDefaultData = false;

      const collections = await aviondb.listCollections();
      if (!collections.includes(collectionName)) {
          insertDefaultData = true;
      }

      const collection = await this.initAvionCollection(aviondb, collectionName);
      const peerCollection = await this.initAvionCollection(aviondb, peerCollectionName);


      if (!this.hasEvents) {
        this.addEvents(aviondb, true, false, false);
        this.addEvents(collection, false, true, false);
        this.addEvents(peerCollection, false, false, true);
        this.hasEvents = true;
      }

      this.peerCollection = peerCollection;
      this.collection = collection;
      this.aviondb = aviondb;

      if (insertDefaultData) {
        console.info("insertDefaultData")
        await this.peerCollection.insertOne({
          multiHash: multiHash,
        } as Peer);

        await this.collection.insertOne(this.lobbyData);
        const found = await this.collection.findOne(this.lobbyData);

        console.info(found);


        if (found) {
          this.lobbyId = found._id;
          
        }
        console.info("this.lobbyId");
        console.info(this.lobbyId);

        this.peers = new Set<string>(this.peers.add(multiHash));
      }
      
      this.addListeningEvents();

      await this.startPublish(
        this.aviondb.id,
        this.collection.dbname,
        this.lobbyId,
      );

      this.isLoading = false;
    }
  }


  addListeningEvents() {
    this.ipfs.libp2p.on("peer:connect", (ipfsPeer: any) => {
      console.log("Connected: ", ipfsPeer.id._idB58String);
    });
    this.ipfs.libp2p.on("peer:disconnect", async (ipfsPeer: any) => {
      console.log("Disconnected: ", ipfsPeer.id._idB58String);

      if (this.peers.has(ipfsPeer.id._idB58String)) {
        console.info("! was a peer");
        const tmp = this.peers;
        tmp.delete(ipfsPeer.id._idB58String);
        this.peers = tmp;
        console.info(this.peers);
      }

      const existing = await this.peerCollection.findOne({multiHash: ipfsPeer.id._idB58String});
      console.info("existing:")
      console.info(existing);
      if (existing) {
        console.info("exists, removing from db");
        await this.peerCollection.deleteOne({
          multiHash: ipfsPeer.id._idB58String
        });

        await this.getPeers();
      }
    });
  }

  addEvents(db: any, isAvionDB: boolean, isCollection: boolean, isPeerCollection: boolean) {
    console.info("addEvents()");
    /*
    Emitted after an entry was added locally to the database. hash is the IPFS hash
    of the latest state of the database. entry is the added database op.
    */
    db.events.on("write", (address, entry, heads) => {
      console.log("EVENT: WRITE");
      console.log(address, entry, heads);
    });
    /*
    Emitted before replicating a part of the database with a peer.
    */
    db.events.on("replicate", address => {
      console.log("EVENT: REPLICATE");
      console.log(address);
    });
    /*
    Emitted while replicating a database. address is id of the database that emitted
    the event. hash is the multihash of the entry that was just loaded. entry is the
    database operation entry. progress is the current progress. have is a map of database
    pieces we have.
    */
    db.events.on(
      "replicate.progress",
      (address, hash, entry, progress, have) => {
        console.log("EVENT: REPLICATE:PROCESS");
        console.log(address, hash, entry, progress, have);
      }
    );
    /* Emitted when the database has synced with another peer. This is usually a good
      place to re-query the database for updated results, eg. if a value of a key was
      changed or if there are new events in an event log.
    */
    db.events.on("replicated", async address => {
      console.log("EVENT: REPLICATED");
      console.log(address);
    });
    /*
    Emitted before loading the database.
    */
    db.events.on("load", dbname => {
      console.log("EVENT: LOAD");
      console.log(dbname);
    });
    /*
    Emitted while loading the local database, once for each entry. dbname is the name
    of the database that emitted the event. hash is the multihash of the entry that was
    just loaded. entry is the database operation entry. progress is a sequential number
    starting from 0 upon calling load().
    */
    db.events.on(
      "load.progress",
      (address, hash, entry, progress, total) => {
        console.log("EVENT: LOAD:PROGRESS");
        console.log(address, hash, entry, progress, total);
      }
    );

    if (this.isLobbyMaster) {
      db.events.on("peer", async peer => {
        console.log("EVENT: PEER");
        console.log(peer);

        if (!this.peers.has(peer) && this.isLobbyMaster) {
          const existing = await this.peerCollection.findOne({multiHash: peer});
          if (!existing) {
            console.info("INSERT PEER");
            await this.peerCollection.insertOne({
              multiHash: peer,
            });
          }

          console.log("subscribing to peer");
          const myId = await this.ipfs.id();
          if (peer !== myId) {
            console.log(peer);
            await this.ipfs.pubsub.subscribe(peer, async (msg: any) => {
              console.log("MESSAGE FROM PEER RECIEVED");
            });
          }

        }

        this.getPeers();
      });
    }

  }

  async getPeers() {
    console.info( `getPeers()` );
    if (this.peerCollection) {
      var peers = await this.peerCollection.find({});
      console.info(peers);

      const tmpArr: Array<string> = peers.map(peer => {
        return peer.multiHash;
      });
      this.peers = new Set<string>(tmpArr);
    }
  }

  async joinLobby(dbAddr: string, collectionName: string) {
    console.info( `joinLobby(${dbAddr}, ${collectionName})` );

    const peerCollectionName = collectionName + "-peers";

    if (!this.aviondb) {
      try {
        const aviondb = await this.openAvionDB(dbAddr);
        this.aviondb = aviondb;
      }
      catch(err) {
        console.error(err);
      }
    }

    if (this.aviondb) {

      console.info("got aviodb");
      console.info(this.aviondb);

      if(!this.collection) {
          try {
            this.collection = await this.openAvionCollection(this.aviondb, collectionName);
          }
          catch(err) {
            console.error(err);
          }
      }

      if(!this.peerCollection) {
        try {
          this.peerCollection = await this.openAvionCollection(this.aviondb, peerCollectionName);
        }
        catch(err) {
          console.error(err);
        }
      }
      

      if (!this.hasEvents && this.aviondb && this.collection && this.peerCollection) {
          this.addEvents(this.aviondb, true, false, false);
          this.addEvents(this.collection, false, true, false);
          this.addEvents(this.peerCollection, false, false, true);
          this.hasEvents = true;
      }
      

    }
  }

  async initAvionCollection(aviondb: any, collectionName: string): Promise<any> {
    console.info( `initAvionCollection( aviondb, ${collectionName})` );
    const collection = await aviondb.initCollection(collectionName);
    return collection;
  }

  async openAvionCollection(aviondb: any, collectionName: string): Promise<any> {
    console.info( `openAvionCollection( aviondb, ${collectionName})` );
    const collection = await aviondb.openCollection(collectionName); //NOTE: Init rather than open
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
div.Lobby {
  width: 100%;
  height: 100%;
  background: linear-gradient(#2f83df, #2fa7df);
}

ion-list {
  border-radius: 0.2em;
}

ion-item.Peer {
  margin-left: 0;
}

div.ProgressBarContainer {
  min-height: 0.2em;
  background:#2f83df;
}

div.Space {
  min-width: 1em;
}

ion-content.CustomContent {
    display: flex;
    align-items: center;
    justify-content: center;
}
</style>
