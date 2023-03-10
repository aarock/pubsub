import { PubSub, PubSubOptions } from "graphql-subscriptions"
import { default as pgListen, Options, Subscriber } from "pg-listen"
import { eventEmitterToAsyncIterator } from "./pubsub.utils.js"
import { IPubSub } from "./pubsub.interface.js"
import { ClientConfig } from "pg"

export type PostgresPubSubOptions = PubSubOptions & Options & ClientConfig & {
  commonMessageHandler?: ( message: any ) => any,
  topics?: string[]
}

export class PostgresPubSub extends PubSub implements IPubSub {

  pgListen: Subscriber<{ [ channel: string ]: any }>
  triggers: string[]
  //@ts-ignore
  ee: Subscriber[ "events" ]
  events: Subscriber[ "events" ]
  connected: boolean
  _subscriptions: any
  _subIdCounter: number
  commonMessageHandler: ( message: any ) => any

  constructor ( {
    commonMessageHandler,
    topics,
    native,
    paranoidChecking,
    retryInterval,
    retryLimit,
    retryTimeout,
    parse,
    serialize,
    ...pgOptions
  }: PostgresPubSubOptions ) {
    super()
    //@ts-ignore
    this.pgListen = pgListen( pgOptions, { native, paranoidChecking, retryInterval, retryLimit, retryTimeout, parse, serialize } )
    this.triggers = ( topics || [] ).concat( [ 'error' ] )
    //@ts-ignore
    this.ee = this.pgListen.notifications
    this.events = this.pgListen.events
    this._subscriptions = {}
    this._subIdCounter = 0
    this.commonMessageHandler = commonMessageHandler || ( ( x ) => x )
    this.connected = false
  }

  /**
   * @returns
   * Rejects when any of the following occur:
   *   1. pg-listen's initial `connect` fails for an exotic (i.e., non-ECONNREFUSED)
   *      reason.
   *   2. pg-listen emits 'error', likely indicating initial connection failed
   *      even after repeated attempts.
   *   3. Connection to the database was successful, but at least one
   *      `LISTEN` query failed.
   *
   * Fulfills otherwise, indicating all of the requested triggers are now being
   * listened to.
   */
  async connect () {
    // These event listeners must be added prior to calling pg-listen's
    // `connect`, who may emit these events.
    const connectedAndListening = new Promise( ( resolve, reject ) => {
      this.pgListen.events.once( 'connected', () => {
        this.initTopics( this.triggers ).then( resolve, reject )
      } )
    } )

    const errorThrown = new Promise( ( _, reject ) => {
      this.pgListen.events.once( 'error', reject )
    } )

    try {
      await this.pgListen.connect()
    } catch ( e ) {
      if ( !e.message.includes( 'ECONNREFUSED' ) ) throw e
    }

    await Promise.race( [ connectedAndListening, errorThrown ] )

    this.connected = true
  }

  initTopics ( triggers ) {
    // confusingly, `pgListen.connect()` will reject if the first connection attempt fails
    // but then it will retry and emit a `connected` event if it later connects
    // see https://github.com/andywer/pg-listen/issues/32
    // so we put logic on the `connected` event
    return Promise.all( triggers.map( ( eventName ) => {
      return this.pgListen.listenTo( eventName )
    } ) )
  }

  async publish ( triggerName, payload ) {
    if ( !this.connected ) {
      const message = `attempted to publish a ${ triggerName } event via pubsub, but client is not yet connected`
      return Promise.reject( new Error( message ) )
    }

    await this.pgListen.notify( triggerName, payload )
    return true as unknown as void
  }

  async subscribe ( triggerName, onMessage ) {
    const callback = message => {
      onMessage(
        message instanceof Error
          ? message
          : this.commonMessageHandler( message )
      )
    }
    await this.pgListen.listenTo( triggerName )
    this.pgListen.notifications.on( triggerName, callback )
    this._subIdCounter = this._subIdCounter + 1
    this._subscriptions[ this._subIdCounter ] = [ triggerName, callback ]
    return Promise.resolve( this._subIdCounter )
  }

  async unsubscribe ( subId ) {
    if ( !this.connected ) {
      console.log( 'attempted to unsubscribe to events via pubsub, but client is not yet connected' )
    }

    const [ triggerName, onMessage ] = this._subscriptions[ subId ]
    delete this._subscriptions[ subId ]
    this.pgListen.unlisten( triggerName )
  }
  async close () {
    await this.pgListen.unlistenAll()
    await this.pgListen.close()
    this.connected = false
  }
  /*
  * The difference between this function and asyncIterator is that the 
  * topics can still be empty. 
  */
  async asyncIteratorPromised ( triggers: string[] ) {
    await this.initTopics( Array.isArray( triggers ) ? triggers : [ triggers ] )
    return eventEmitterToAsyncIterator(
      this.pgListen,
      triggers,
      this.commonMessageHandler
    ) as unknown as AsyncIterator<any>
  }

  asyncIterator ( triggers: string[] ) {
    return eventEmitterToAsyncIterator(
      this.pgListen,
      triggers,
      this.commonMessageHandler
    ) as unknown as AsyncIterator<any>
  }

}
