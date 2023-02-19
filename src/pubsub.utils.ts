import { $$asyncIterator } from "iterall"

export function eventEmitterToAsyncIterator<T> ( pgListen, eventsNames, commonMessageHandler = message => message ) {
  const pullQueue: ( ( value: IteratorResult<T> ) => void )[] = []
  const pushQueue: T[] = []
  const eventsArray = typeof eventsNames === "string" ? [ eventsNames ] : eventsNames
  let listening = true

  const pushValue = ( event ) => {
    const value = commonMessageHandler( event )
    if ( pullQueue.length !== 0 ) pullQueue.shift()?.( { value, done: false } )
    else pushQueue.push( value )
  }

  const pullValue = () => {
    return new Promise( resolve => {
      if ( pushQueue.length !== 0 ) resolve( { value: pushQueue.shift(), done: false } )
      else pullQueue.push( resolve )
    } )
  }

  const emptyQueue = () => {
    if ( listening ) {
      listening = false
      pullQueue.forEach( resolve => resolve( { value: undefined, done: true } ) )
      pullQueue.length = 0
      pushQueue.length = 0
    }
  }

  const addEventListeners = async () => {
    for ( const eventName of eventsArray ) {
      pgListen.notifications.on( eventName, pushValue )
    }
  }

  addEventListeners()

  return {

    next () {
      return listening ? pullValue() : this.return()
    },

    return () {
      emptyQueue()

      return Promise.resolve( { value: undefined, done: true } )
    },

    throw ( error ) {
      emptyQueue()
      return Promise.reject( error )
    },
    
    [ $$asyncIterator ] () {
      return this
    }

  }
}

export function isTruthy ( val?: string ) { return !![ 'true', 'on', '1', 'yes', 'y' ].includes( val?.toLowerCase() ) }