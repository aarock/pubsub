import { Module } from "@nestjs/common"
import { PostgresPubSub } from "./pubsub.postgres.js"
import { isTruthy } from "./pubsub.utils.js"
import { exit } from "process"

export const PUBSUB_TOKEN = 'PUBSUB'

@Module( {
    providers: [
        {
            provide: PUBSUB_TOKEN,
            useFactory: async () => {
                const pubsub = new PostgresPubSub( {
                    connectionString: process.env.DATABASE_URL,
                    ssl: isTruthy( process.env.DATABASE_SSL ) && { rejectUnauthorized: false },
                    topics: [ "Event" ],
                    retryTimeout: Infinity,
                    retryInterval: 60_000,
                } )
                pubsub.events.on( "error", () => exit( 1 ) )
                pubsub.events.on( "error", e => console.log( "Pubsub -- Error", e ) )
                pubsub.events.on( "connected", () => console.log( "Pubsub -- Connected" ) )
                pubsub.events.on( "reconnect", () => console.log( "Pubsub -- Reconnecting" ) )
                await pubsub.connect()
                return pubsub
            },
        },
    ],
    exports: [
        PUBSUB_TOKEN,
    ]
} )
export class PubSubModule { }