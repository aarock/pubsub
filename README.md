# @aarock/pubsub

A graphql subscriptions implementation using postgres and apollo's graphql-subscriptions

Forked from GraphQLCollege/graphql-postgres-subscriptions, where `pg-ipc` is replaced by `pg-listen` so that the database connection can auto-reconnect

This package implements the PubSubEngine Interface from the graphql-subscriptions package and also the new AsyncIterator interface. It allows you to connect your subscriptions manger to a postgres based Pub Sub mechanism to support multiple subscription manager instances.

## Installation

`npm i @aarock/pubsub`

## Usage

Import the module:

```ts
//...
import { PubSubModule } from "@aarock/pubsub"
//...
@Module( {
    imports: [
        ScheduleModule.forRoot( /* ... */ ),
        TypeOrmModule.forRoot( /* ... */ ),
        GraphQLModule.forRoot<YogaDriverConfig>( /* ... */ ),
        PubSubModule,
    ],
    exports: [ /* ... */ ],
    providers: [ /* ... */ ],
} )
export class MyModule {
  /* ... */
}
```

Inject with `PUBSUB_TOKEN` and publish

```ts
export class MyService {

  private maxHistory = 50

  constructor (
    // ...
    @Inject( PUBSUB_TOKEN ) @Optional() protected readonly pubSub: IPubSub,
  ) { super() }

  // ...

  triggerEvent () {
    this.pubSub?.publish( "MyEvent", { foo:"bar" } )
  }

```

## Internal Usage

First of all, follow the instructions in [graphql-subscriptions](https://github.com/apollographql/graphql-subscriptions) to add subscriptions to your app.

Afterwards replace `PubSub` with `PostgresPubSub`:

```js
// Before
import { PubSub } from "graphql-subscriptions-retry";

export const pubsub = new PubSub();
```

```js
// After
import { PostgresPubSub } from "graphql-postgres-subscriptions-retry";

export const pubsub = new PostgresPubSub();
await pubsub.connect()
```

Don't forget to await the `connect()` method, or else it will never start the connection with postgres.

This library uses [`pg-listen`](https://www.npmjs.com/package/pg-listen) to connect to PostgreSQL. If you want to customize connection options, please refer to their connection docs.

You have two options:

If you don's send any argument to `new PostgresPubSub()`, we'll create a `postgres` client with no arguments.

You can also pass [node-postgres connection options](https://node-postgres.com/features/connecting#programmatic) to `PostgresPubSub`.

**Important**: If you want to use the asyncIterator (which is used by graphql subscriptions) you need to pass them as an array of topics on the options parameter. This should be an array of all the topics/channels you want to subscribe to. The reason we need to know these ahead of time, is because otherwise it would be an async operation to add them or create the async iterator or use the `asyncIteratorPromised` function instead.

```js
export const pubsub = new PostgresPubSub({
  topics: ['a', 'b', 'c']
})
await pubsub.connect()
```

### commonMessageHandler

The second argument to `new PostgresPubSub()` is the `commonMessageHandler`. The common message handler gets called with the received message from PostgreSQL.
You can transform the message before it is passed to the individual filter/resolver methods of the subscribers.
This way it is for example possible to inject one instance of a [DataLoader](https://github.com/facebook/dataloader) which can be used in all filter/resolver methods.

```javascript
const getDataLoader = () => new DataLoader(...)
const commonMessageHandler = ({attributes: {id}, data}) => ({id, dataLoader: getDataLoader()})
const pubsub = new PostgresPubSub({ client, commonMessageHandler });
```

```javascript
export const resolvers = {
  Subscription: {
    somethingChanged: {
      resolve: ({ id, dataLoader }) => dataLoader.load(id)
    }
  }
};
```

## Error handling

Following how pg-listen works, `PostgresPubSub` instances have an `events` event emitter which emits `'error'` events.

```js
const ps = new PostgresPubSub();

ps.events.on("error", err => {
  console.log(err)
})
```
## Shutdown

This fork provides a new `async close():Promise<void>` method that can be called to stop the listeners and release the `pg` connection for a clean shutdown.