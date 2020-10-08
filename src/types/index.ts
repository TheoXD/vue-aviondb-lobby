export interface Peer {
    multiHash: string
}

export interface MasterMessage {
    dbAddr: string,
    collectionName: string,
    headHash: string,
    peersHeadHash: string,
    lobbyId: string
}

export interface LobbyData {
    title: string,
}