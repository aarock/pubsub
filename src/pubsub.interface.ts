export interface IPubSub {
    publish ( triggerName: string, payload: any ): Promise<void>
    subscribe ( triggerName: string, onMessage: ( ...args: any[] ) => void ): Promise<number>
    unsubscribe ( subId: number ): void
    asyncIterator<T> ( triggers: string | string[] ): AsyncIterator<T>
}
