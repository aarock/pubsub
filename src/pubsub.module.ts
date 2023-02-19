import { Module } from "@nestjs/common"
import { AuditableTypesMetadataStorage } from "@aarock/api-kit"
import { PostgresPubSub } from "./pubsub.postgres.js"
import { isTruthy } from "./pubsub.utils.js"
import { exit } from "process"

export const PUBSUB_TOKEN = 'PUBSUB'

@Module( {
    providers: [
        {
            provide: PUBSUB_TOKEN,
            useFactory: async () => {
                const types = AuditableTypesMetadataStorage.getTypes().map( c => c.name )
                const pubsub = new PostgresPubSub( {
                    connectionString: process.env.DB_URI,
                    ssl: isTruthy( process.env.DB_SSL ) && { rejectUnauthorized: false },
                    topics: [ "Event", ...types ],
                    retryTimeout: Infinity,
                    retryInterval: 60_000,
                } )
                pubsub.events.on( "connected", () => console.log( "Pubsub -- Connected" ) )
                pubsub.events.on( "reconnect", () => console.log( "Pubsub -- Reconnecting" ) )
                pubsub.events.on( "error", ( e ) => {
                    console.log( "Pubsub -- Error", e )
                    exit( 1 )
                } )
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