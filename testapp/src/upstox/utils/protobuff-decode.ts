import { load, Root } from 'protobufjs';

export const initMarketProtoBuf = () => {
    return load(__dirname + "/protofile/market-feed.proto");
}

export const decodeMarketFeed = async (protoBufRoot: Root, buffer: any) => {

    if (!protoBufRoot) {
        console.warn("Protobuf part not initialized yet!");
        return null;
    }

    const FeedResponse = protoBufRoot.lookupType(
        "com.upstox.marketdatafeeder.rpc.proto.FeedResponse"
    );
    return FeedResponse.decode(buffer);
};
