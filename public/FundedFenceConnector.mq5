//+------------------------------------------------------------------+
//|                                      FundedFenceConnector.mq5     |
//| Read-only MT5 account data connector. It never places, changes,  |
//| or closes trades.                                                |
//+------------------------------------------------------------------+
#property copyright "FundedFence"
#property version   "001.004"
#property strict
#property description "Read-only signed account-data connector for FundedFence."

input string ApiBaseUrl = "https://YOUR-FUNDEDFENCE-SITE.example";
input string PairingCode = "";
input bool   RePairSavedConnector = false;
input int    ActiveSnapshotSeconds = 2;
input int    IdleSnapshotSeconds = 15;
input int    RequestTimeoutMs = 1800;
input int    CurrencyExponent = 2;

string CONNECTOR_VERSION = "0.4.0";
string PROTOCOL_VERSION = "1.1";
string BUFFER_FILE = "FundedFenceConnector/pending-events-v1-1.jsonl";
string CREDENTIALS_FILE = "FundedFenceConnector/credentials.tsv";

string g_device_id = "";
string g_account_id = "";
string g_access_token = "";
string g_refresh_token = "";
string g_ingestion_endpoint = "";
string g_refresh_endpoint = "";
long   g_sequence = 0;
long   g_last_snapshot_ms = 0;
long   g_last_heartbeat_ms = 0;
long   g_next_pair_attempt_ms = 0;
int    g_pair_failures = 0;
bool   g_snapshot_dirty = true;
bool   g_reconciliation_required = true;
int      g_pending_transaction_types[];
ulong    g_pending_orders[];
ulong    g_pending_deals[];
ulong    g_pending_positions[];
datetime g_pending_event_times[];

int OnInit()
  {
   PrintFormat("FundedFence connector %s (protocol %s) initializing.",CONNECTOR_VERSION,PROTOCOL_VERSION);
   if(StringLen(ApiBaseUrl)<8 || (StringFind(ApiBaseUrl,"https://")!=0 && StringFind(ApiBaseUrl,"http://localhost")!=0 && StringFind(ApiBaseUrl,"http://fundedfence.ddns.net")!=0))
     {
      Print("FundedFence: ApiBaseUrl must use HTTPS. Temporary HTTP is allowed for localhost and fundedfence.ddns.net during deployment testing.");
      return(INIT_PARAMETERS_INCORRECT);
     }
   if(StringFind(ApiBaseUrl,"http://fundedfence.ddns.net")==0)
      Print("FundedFence: warning - using temporary HTTP endpoint. Move to HTTPS before production use.");
   if(ActiveSnapshotSeconds<1 || IdleSnapshotSeconds<2 || RequestTimeoutMs<250 || CurrencyExponent<0 || CurrencyExponent>6)
      return(INIT_PARAMETERS_INCORRECT);

   EventSetTimer(1);
   if(RePairSavedConnector)
     {
      ClearCredentials();
      Print("FundedFence: saved connector credentials cleared for re-pairing. Set RePairSavedConnector to false after pairing succeeds.");
     }
   if(LoadCredentials())
      PrintFormat("FundedFence: loaded saved connector credentials for account %s.",g_account_id);
   Print("FundedFence read-only connector started. Add the API origin to MT5 WebRequest allowed URLs.");
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
  }

void OnTradeTransaction(const MqlTradeTransaction &transaction,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
  {
   // Do not perform network I/O inside the trade callback. Queue every event
   // so rapid fills and partial closes cannot overwrite one another before the
   // timer sends their normalized deal details and a full reconciliation.
   int count=ArraySize(g_pending_transaction_types);
   if(count<512)
     {
      ArrayResize(g_pending_transaction_types,count+1,128);
      ArrayResize(g_pending_orders,count+1,128);
      ArrayResize(g_pending_deals,count+1,128);
      ArrayResize(g_pending_positions,count+1,128);
      ArrayResize(g_pending_event_times,count+1,128);
      g_pending_transaction_types[count]=(int)transaction.type;
      g_pending_orders[count]=transaction.order;
      g_pending_deals[count]=transaction.deal;
      g_pending_positions[count]=transaction.position;
      g_pending_event_times[count]=TimeGMT();
     }
   else
      Print("FundedFence: trade-event queue reached 512 entries; full reconciliation retained.");
   g_snapshot_dirty=true;
   g_reconciliation_required=true;
  }

void OnTimer()
  {
   const long now_ms=(long)GetTickCount64();
   if(g_device_id=="")
     {
      if(PairingCode!="" && now_ms>=g_next_pair_attempt_ms)
         PairConnector();
      return;
     }

   FlushBufferedEvents();
   int pending_count=ArraySize(g_pending_transaction_types);
   for(int pending_index=0;pending_index<pending_count;pending_index++)
     {
      string payload=BuildTradeTransactionPayload(g_pending_transaction_types[pending_index],
                                                   g_pending_orders[pending_index],
                                                   g_pending_deals[pending_index],
                                                   g_pending_positions[pending_index]);
      QueueOrSend("trade.transaction",payload,g_pending_event_times[pending_index]);
     }
   if(pending_count>0)
     {
      ArrayResize(g_pending_transaction_types,0);
      ArrayResize(g_pending_orders,0);
      ArrayResize(g_pending_deals,0);
      ArrayResize(g_pending_positions,0);
      ArrayResize(g_pending_event_times,0);
     }

   int interval=(PositionsTotal()>0 || OrdersTotal()>0) ? ActiveSnapshotSeconds : IdleSnapshotSeconds;
   bool terminal_connected=(TerminalInfoInteger(TERMINAL_CONNECTED)!=0);
   if(terminal_connected && (g_snapshot_dirty || now_ms-g_last_snapshot_ms>=(long)interval*1000))
     {
      string event_type=g_reconciliation_required ? "reconciliation" : "account.snapshot";
      QueueOrSend(event_type,BuildSnapshotPayload(),TimeGMT());
      g_last_snapshot_ms=now_ms;
      g_snapshot_dirty=false;
      g_reconciliation_required=false;
     }
   else if(now_ms-g_last_heartbeat_ms>=10000)
     {
      QueueOrSend("heartbeat",BuildHeartbeatPayload(),TimeGMT());
      g_last_heartbeat_ms=now_ms;
     }
  }

bool PairConnector()
  {
   long terminal_login=AccountInfoInteger(ACCOUNT_LOGIN);
   string terminal_server=AccountInfoString(ACCOUNT_SERVER);
   if(!TerminalInfoInteger(TERMINAL_CONNECTED) || terminal_login<=0 || terminal_server=="")
     {
      Print("FundedFence: connect MT5 to the intended broker account before pairing.");
      g_next_pair_attempt_ms=(long)GetTickCount64()+30000;
      return(false);
     }
   string normalized=PairingCode;
   StringReplace(normalized," ","");
   StringReplace(normalized,"-","");
   if(StringLen(normalized)!=6)
     {
      Print("FundedFence: pairing code must contain six digits.");
      g_next_pair_attempt_ms=(long)GetTickCount64()+30000;
      return(false);
     }

   string hashed_login=CurrentIdentityHash();
   string body="{\"pairingCode\":\""+EscapeJson(normalized)+"\","
               "\"hashedLogin\":\""+hashed_login+"\","
               "\"serverIdentity\":\""+EscapeJson(AccountInfoString(ACCOUNT_SERVER))+"\","
               "\"platformVersion\":\""+EscapeJson((string)TerminalInfoInteger(TERMINAL_BUILD))+"\","
               "\"connectorVersion\":\""+CONNECTOR_VERSION+"\"}";
   string response="";
   int status=HttpPost(ApiBaseUrl+"/api/v1/connector/pair",body,"",response);
   if(status!=200)
     {
      g_pair_failures++;
      int exponent=MathMin(g_pair_failures,6);
      int delay_seconds=(int)MathMin(300,5*MathPow(2,exponent));
      g_next_pair_attempt_ms=(long)GetTickCount64()+(long)delay_seconds*1000;
      PrintFormat("FundedFence: pairing failed with HTTP %d: %s. Retrying in %d seconds.",status,response,delay_seconds);
      return(false);
     }

   g_device_id=JsonString(response,"deviceId");
   g_account_id=JsonString(response,"accountId");
   g_access_token=JsonString(response,"accessToken");
   g_refresh_token=JsonString(response,"refreshToken");
   g_ingestion_endpoint=JsonString(response,"ingestionEndpoint");
   g_refresh_endpoint=JsonString(response,"refreshEndpoint");
   if(g_device_id=="" || g_account_id=="" || g_access_token=="" || g_ingestion_endpoint=="")
     {
      ClearCredentials();
      Print("FundedFence: pairing response was incomplete.");
      return(false);
     }

   g_pair_failures=0;
   g_sequence=0;
   g_reconciliation_required=true;
   g_snapshot_dirty=true;
   SaveCredentials();
   PrintFormat("FundedFence: paired read-only connector %s to account workspace %s.",g_device_id,g_account_id);
   return(true);
  }

string BuildSnapshotPayload()
  {
   string positions="[";
   bool first=true;
   for(int i=0;i<PositionsTotal();i++)
     {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      string symbol=PositionGetString(POSITION_SYMBOL);
      int price_digits=(int)SymbolInfoInteger(symbol,SYMBOL_DIGITS);
      long tick_size_points=PriceToPoints(symbol,SymbolInfoDouble(symbol,SYMBOL_TRADE_TICK_SIZE));
      double tick_value_loss=SymbolInfoDouble(symbol,SYMBOL_TRADE_TICK_VALUE_LOSS);
      if(tick_value_loss<=0.0)
         tick_value_loss=SymbolInfoDouble(symbol,SYMBOL_TRADE_TICK_VALUE);
      long tick_value_loss_minor=MoneyToMinor(tick_value_loss);
      string contract_metadata="";
      if(tick_size_points>0 && tick_value_loss_minor>0)
         contract_metadata="\"priceDigits\":"+(string)price_digits+","
                           "\"tickSizePoints\":\""+(string)tick_size_points+"\","
                           "\"tickValueLossMinorPerLot\":\""+(string)tick_value_loss_minor+"\",";
      if(!first) positions+=",";
      first=false;
      positions+="{\"ticket\":\""+(string)ticket+"\","
                 "\"symbol\":\""+EscapeJson(symbol)+"\","
                 "\"direction\":\""+(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY ? "buy" : "sell")+"\","
                 "\"volumeUnits\":\""+(string)VolumeToUnits(PositionGetDouble(POSITION_VOLUME))+"\","
                 "\"openPricePoints\":\""+(string)PriceToPoints(symbol,PositionGetDouble(POSITION_PRICE_OPEN))+"\","
                 "\"currentPricePoints\":\""+(string)PriceToPoints(symbol,PositionGetDouble(POSITION_PRICE_CURRENT))+"\","
                 "\"stopLossPricePoints\":"+NullablePrice(symbol,PositionGetDouble(POSITION_SL))+","
                 "\"takeProfitPricePoints\":"+NullablePrice(symbol,PositionGetDouble(POSITION_TP))+","
                 +contract_metadata+
                 "\"swapMinor\":\""+(string)MoneyToMinor(PositionGetDouble(POSITION_SWAP))+"\","
                 "\"floatingPnlMinor\":\""+(string)MoneyToMinor(PositionGetDouble(POSITION_PROFIT))+"\","
                 "\"openedAt\":\""+IsoUtc((datetime)PositionGetInteger(POSITION_TIME))+"\"}";
     }
   positions+="]";

   string pending_orders="[";
   first=true;
   for(int order_index=0;order_index<OrdersTotal();order_index++)
     {
      ulong order_ticket=OrderGetTicket(order_index);
      if(order_ticket==0 || !OrderSelect(order_ticket))
         continue;
      string order_symbol=OrderGetString(ORDER_SYMBOL);
      datetime expiration=(datetime)OrderGetInteger(ORDER_TIME_EXPIRATION);
      if(!first) pending_orders+=",";
      first=false;
      pending_orders+="{\"ticket\":\""+(string)order_ticket+"\","+
                      "\"symbol\":\""+EscapeJson(order_symbol)+"\","+
                      "\"orderType\":"+(string)OrderGetInteger(ORDER_TYPE)+","+
                      "\"volumeInitialUnits\":\""+(string)VolumeToUnits(OrderGetDouble(ORDER_VOLUME_INITIAL))+"\","+
                      "\"volumeCurrentUnits\":\""+(string)VolumeToUnits(OrderGetDouble(ORDER_VOLUME_CURRENT))+"\","+
                      "\"openPricePoints\":\""+(string)PriceToPoints(order_symbol,OrderGetDouble(ORDER_PRICE_OPEN))+"\","+
                      "\"stopLossPricePoints\":"+NullablePrice(order_symbol,OrderGetDouble(ORDER_SL))+","+
                      "\"takeProfitPricePoints\":"+NullablePrice(order_symbol,OrderGetDouble(ORDER_TP))+","+
                      "\"placedAt\":\""+IsoUtc((datetime)OrderGetInteger(ORDER_TIME_SETUP))+"\","+
                      "\"expiresAt\":"+(expiration>0 ? "\""+IsoUtc(expiration)+"\"" : "null")+"}";
     }
   pending_orders+="]";

   string account="{\"balanceMinor\":\""+(string)MoneyToMinor(AccountInfoDouble(ACCOUNT_BALANCE))+"\","
                  "\"equityMinor\":\""+(string)MoneyToMinor(AccountInfoDouble(ACCOUNT_EQUITY))+"\","
                  "\"marginMinor\":\""+(string)MoneyToMinor(AccountInfoDouble(ACCOUNT_MARGIN))+"\","
                  "\"freeMarginMinor\":\""+(string)MoneyToMinor(AccountInfoDouble(ACCOUNT_MARGIN_FREE))+"\","
                  "\"floatingPnlMinor\":\""+(string)MoneyToMinor(AccountInfoDouble(ACCOUNT_PROFIT))+"\","
                  "\"serverTime\":\""+(string)TimeTradeServer()+"\"}";
   return("{\"account\":"+account+",\"positions\":"+positions+",\"pendingOrders\":"+pending_orders+",\"pendingOrderCount\":"+(string)OrdersTotal()+"}");
  }

string BuildTradeTransactionPayload(const int transaction_type,const ulong order_ticket,const ulong deal_ticket,const ulong position_ticket)
  {
   string deal_json="null";
   if(deal_ticket>0 && HistoryDealSelect(deal_ticket))
     {
      string symbol=HistoryDealGetString(deal_ticket,DEAL_SYMBOL);
      deal_json="{\"ticket\":\""+(string)deal_ticket+"\","+
                "\"orderTicket\":\""+(string)HistoryDealGetInteger(deal_ticket,DEAL_ORDER)+"\","+
                "\"positionTicket\":\""+(string)HistoryDealGetInteger(deal_ticket,DEAL_POSITION_ID)+"\","+
                "\"symbol\":\""+EscapeJson(symbol)+"\","+
                "\"dealType\":"+(string)HistoryDealGetInteger(deal_ticket,DEAL_TYPE)+","+
                "\"entryType\":"+(string)HistoryDealGetInteger(deal_ticket,DEAL_ENTRY)+","+
                "\"volumeUnits\":\""+(string)VolumeToUnits(HistoryDealGetDouble(deal_ticket,DEAL_VOLUME))+"\","+
                "\"pricePoints\":\""+(string)PriceToPoints(symbol,HistoryDealGetDouble(deal_ticket,DEAL_PRICE))+"\","+
                "\"profitMinor\":\""+(string)MoneyToMinor(HistoryDealGetDouble(deal_ticket,DEAL_PROFIT))+"\","+
                "\"commissionMinor\":\""+(string)MoneyToMinor(HistoryDealGetDouble(deal_ticket,DEAL_COMMISSION))+"\","+
                "\"swapMinor\":\""+(string)MoneyToMinor(HistoryDealGetDouble(deal_ticket,DEAL_SWAP))+"\","+
                "\"feeMinor\":\""+(string)MoneyToMinor(HistoryDealGetDouble(deal_ticket,DEAL_FEE))+"\","+
                "\"occurredAt\":\""+IsoUtc((datetime)HistoryDealGetInteger(deal_ticket,DEAL_TIME))+"\"}";
     }
   return("{\"transactionType\":"+(string)transaction_type+","+
          "\"orderTicket\":\""+(string)order_ticket+"\","+
          "\"dealTicket\":\""+(string)deal_ticket+"\","+
          "\"positionTicket\":\""+(string)position_ticket+"\","+
          "\"deal\":"+deal_json+"}");
  }

string BuildHeartbeatPayload()
  {
   return(StringFormat("{\"terminalConnected\":%s,\"tradeAllowed\":%s,\"positionsOpen\":%d,\"ordersPending\":%d,\"connectorVersion\":\"%s\"}",
                       TerminalInfoInteger(TERMINAL_CONNECTED) ? "true" : "false",
                       AccountInfoInteger(ACCOUNT_TRADE_ALLOWED) ? "true" : "false",
                       PositionsTotal(),OrdersTotal(),CONNECTOR_VERSION));
  }

void QueueOrSend(const string event_type,const string payload,const datetime occurred_at)
  {
   g_sequence++;
   SaveCredentials();
   string idempotency=StringFormat("evt_%s_%I64d",g_device_id,g_sequence);
   string envelope="{\"accountId\":\""+EscapeJson(g_account_id)+"\","
                   "\"connectorId\":\""+EscapeJson(g_device_id)+"\","
                   "\"eventType\":\""+event_type+"\","
                   "\"idempotencyKey\":\""+idempotency+"\","
                   "\"occurredAt\":\""+IsoUtc(occurred_at)+"\","
                   "\"payload\":"+payload+","
                   "\"protocolVersion\":\""+PROTOCOL_VERSION+"\","
                   "\"sentAt\":\""+IsoUtc(TimeGMT())+"\","
                   "\"sequence\":"+(string)g_sequence+","
                   "\"terminalIdentityHash\":\""+CurrentIdentityHash()+"\"}";
   if(!SendEnvelope(envelope))
      AppendBufferedEvent(envelope);
  }

bool SendEnvelope(const string envelope)
  {
   string signature=HmacSha256Hex(g_access_token,envelope);
   if(signature=="") return(false);
   string response="";
   string extra_headers="Authorization: Bearer "+g_access_token+"\r\nX-FundedFence-Signature: "+signature+"\r\n";
   int status=HttpPost(g_ingestion_endpoint,envelope,extra_headers,response);
   if(status==202 || status==200) return(true);
   if(status==401 && RefreshAccessToken())
     {
      signature=HmacSha256Hex(g_access_token,envelope);
      extra_headers="Authorization: Bearer "+g_access_token+"\r\nX-FundedFence-Signature: "+signature+"\r\n";
      status=HttpPost(g_ingestion_endpoint,envelope,extra_headers,response);
      if(status==202 || status==200) return(true);
     }
   if(g_device_id=="") return(true);
   if(status==409 && StringFind(response,"terminal_identity_changed")>=0)
     {
      Print("FundedFence: MT5 account identity changed. Connector credentials cleared; generate a new pairing code.");
      ClearCredentials();
      return(true);
     }
   if(status!=-1)
      PrintFormat("FundedFence: event rejected with HTTP %d: %s",status,response);
   return(false);
  }

bool RefreshAccessToken()
  {
   if(g_refresh_token=="" || g_refresh_endpoint=="") return(false);
   string response="";
   int status=HttpPost(g_refresh_endpoint,"{}","Authorization: Bearer "+g_refresh_token+"\r\n",response);
   if(status!=200)
     {
      if(status==401 && StringFind(response,"connector_revoked")>=0)
        {
         Print("FundedFence: this connector was replaced or revoked. Saved credentials cleared; enter the new pairing code.");
         ClearCredentials();
         return(false);
        }
      if(status!=-1) PrintFormat("FundedFence: access-token refresh failed with HTTP %d: %s",status,response);
      return(false);
     }
   string replacement=JsonString(response,"accessToken");
   if(replacement=="") return(false);
   g_access_token=replacement;
   SaveCredentials();
   return(true);
  }

int HttpPost(const string url,const string body,const string extra_headers,string &response_text)
  {
   char request_data[],response_data[];
   StringToCharArray(body,request_data,0,WHOLE_ARRAY,CP_UTF8);
   if(ArraySize(request_data)>0) ArrayResize(request_data,ArraySize(request_data)-1);
   string response_headers="";
   string headers="Content-Type: application/json\r\nAccept: application/json\r\n"+extra_headers;
   ResetLastError();
   int status=WebRequest("POST",url,headers,RequestTimeoutMs,request_data,response_data,response_headers);
   if(status==-1)
     {
      PrintFormat("FundedFence: WebRequest failed (%d). Confirm the API origin is allowed in MT5 options.",GetLastError());
      return(-1);
     }
   response_text=CharArrayToString(response_data,0,WHOLE_ARRAY,CP_UTF8);
   return(status);
  }

void AppendBufferedEvent(const string envelope)
  {
   int handle=FileOpen(BUFFER_FILE,FILE_READ|FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_COMMON);
   if(handle==INVALID_HANDLE)
     {
      PrintFormat("FundedFence: unable to open offline buffer (%d).",GetLastError());
      return;
     }
   FileSeek(handle,0,SEEK_END);
   FileWrite(handle,envelope);
   FileClose(handle);
  }

void FlushBufferedEvents()
  {
   int input_handle=FileOpen(BUFFER_FILE,FILE_READ|FILE_TXT|FILE_ANSI|FILE_COMMON);
   if(input_handle==INVALID_HANDLE) return;
   string remaining[];
   int remaining_count=0;
   bool blocked=false;
   while(!FileIsEnding(input_handle))
     {
      string envelope=FileReadString(input_handle);
      if(envelope=="") continue;
      bool sent=(!blocked && SendEnvelope(envelope));
      if(g_device_id=="")
        {
         FileClose(input_handle);
         FileDelete(BUFFER_FILE,FILE_COMMON);
         return;
        }
      if(!sent)
        {
         blocked=true;
         ArrayResize(remaining,remaining_count+1);
         remaining[remaining_count++]=envelope;
        }
     }
   FileClose(input_handle);
   FileDelete(BUFFER_FILE,FILE_COMMON);
   if(remaining_count>0)
     {
      int output=FileOpen(BUFFER_FILE,FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_COMMON);
      if(output!=INVALID_HANDLE)
        {
         for(int i=0;i<remaining_count;i++) FileWrite(output,remaining[i]);
         FileClose(output);
        }
     }
  }

string HmacSha256Hex(const string key_text,const string message)
  {
   uchar key[],data[],inner_input[],outer_input[],inner_hash[],digest[],empty_key[];
   Utf8Bytes(key_text,key);
   Utf8Bytes(message,data);
   if(ArraySize(key)>64)
     {
      if(CryptEncode(CRYPT_HASH_SHA256,key,empty_key,digest)!=32) return("");
      ArrayCopy(key,digest);
      ArrayResize(key,32);
     }
   int key_size=ArraySize(key);
   ArrayResize(key,64);
   for(int i=key_size;i<64;i++) key[i]=0;
   ArrayResize(inner_input,64+ArraySize(data));
   ArrayResize(outer_input,64+32);
   for(int i=0;i<64;i++)
     {
      inner_input[i]=(uchar)(key[i]^0x36);
      outer_input[i]=(uchar)(key[i]^0x5c);
     }
   ArrayCopy(inner_input,data,64,0,WHOLE_ARRAY);
   if(CryptEncode(CRYPT_HASH_SHA256,inner_input,empty_key,inner_hash)!=32) return("");
   ArrayCopy(outer_input,inner_hash,64,0,32);
   if(CryptEncode(CRYPT_HASH_SHA256,outer_input,empty_key,digest)!=32) return("");
   return(BytesToHex(digest));
  }

string Sha256Hex(const string value)
  {
   uchar data[],digest[],empty_key[];
   Utf8Bytes(value,data);
   if(CryptEncode(CRYPT_HASH_SHA256,data,empty_key,digest)!=32) return("");
   return(BytesToHex(digest));
  }

void Utf8Bytes(const string value,uchar &result[])
  {
   StringToCharArray(value,result,0,WHOLE_ARRAY,CP_UTF8);
   if(ArraySize(result)>0) ArrayResize(result,ArraySize(result)-1);
  }

string BytesToHex(const uchar &bytes[])
  {
   string result="";
   for(int i=0;i<ArraySize(bytes);i++) result+=StringFormat("%02x",bytes[i]);
   return(result);
  }

string JsonString(const string json,const string field)
  {
   string marker="\""+field+"\":\"";
   int start=StringFind(json,marker);
   if(start<0) return("");
   start+=StringLen(marker);
   int finish=start;
   bool escaped=false;
   while(finish<StringLen(json))
     {
      ushort character=StringGetCharacter(json,finish);
      if(character=='"' && !escaped) break;
      escaped=(character=='\\' && !escaped);
      if(character!='\\') escaped=false;
      finish++;
     }
   return(StringSubstr(json,start,finish-start));
  }

string EscapeJson(string value)
  {
   StringReplace(value,"\\","\\\\");
   StringReplace(value,"\"","\\\"");
   StringReplace(value,"\r","\\r");
   StringReplace(value,"\n","\\n");
   return(value);
  }

string CurrentIdentityHash()
  {
   string identity=StringFormat("%I64d:%s",AccountInfoInteger(ACCOUNT_LOGIN),AccountInfoString(ACCOUNT_SERVER));
   return(Sha256Hex(identity));
  }

string IsoUtc(const datetime value)
  {
   MqlDateTime parts;
   TimeToStruct(value,parts);
   return(StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",parts.year,parts.mon,parts.day,parts.hour,parts.min,parts.sec));
  }

long MoneyToMinor(const double value)
  {
   return((long)MathRound(value*MathPow(10,CurrencyExponent)));
  }

long PriceToPoints(const string symbol,const double price)
  {
   double point=SymbolInfoDouble(symbol,SYMBOL_POINT);
   if(point<=0.0) return(0);
   return((long)MathRound(price/point));
  }

long VolumeToUnits(const double volume)
  {
   return((long)MathRound(volume*10000.0));
  }

string NullablePrice(const string symbol,const double price)
  {
   if(price<=0.0) return("null");
   return("\""+(string)PriceToPoints(symbol,price)+"\"");
  }

void ClearCredentials()
  {
   g_device_id="";
   g_account_id="";
   g_access_token="";
   g_refresh_token="";
   g_ingestion_endpoint="";
   g_refresh_endpoint="";
   g_sequence=0;
   FileDelete(CREDENTIALS_FILE,FILE_COMMON);
   FileDelete(BUFFER_FILE,FILE_COMMON);
  }

bool LoadCredentials()
  {
   int handle=FileOpen(CREDENTIALS_FILE,FILE_READ|FILE_TXT|FILE_ANSI|FILE_COMMON);
   if(handle==INVALID_HANDLE) return(false);
   string device_id=FileReadString(handle);
   string account_id=FileReadString(handle);
   string access_token=FileReadString(handle);
   string refresh_token=FileReadString(handle);
   string ingestion_endpoint=FileReadString(handle);
   string refresh_endpoint=FileReadString(handle);
   string sequence_text=FileReadString(handle);
   FileClose(handle);

   if(device_id=="" || account_id=="" || access_token=="" || ingestion_endpoint=="")
      return(false);

   g_device_id=device_id;
   g_account_id=account_id;
   g_access_token=access_token;
   g_refresh_token=refresh_token;
   g_ingestion_endpoint=ingestion_endpoint;
   g_refresh_endpoint=refresh_endpoint;
   g_sequence=(long)StringToInteger(sequence_text);
   g_reconciliation_required=true;
   g_snapshot_dirty=true;
   return(true);
  }

void SaveCredentials()
  {
   if(g_device_id=="" || g_account_id=="" || g_access_token=="" || g_ingestion_endpoint=="")
      return;

   int handle=FileOpen(CREDENTIALS_FILE,FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_COMMON);
   if(handle==INVALID_HANDLE)
     {
      PrintFormat("FundedFence: unable to save connector credentials (%d).",GetLastError());
      return;
     }
   FileWrite(handle,g_device_id);
   FileWrite(handle,g_account_id);
   FileWrite(handle,g_access_token);
   FileWrite(handle,g_refresh_token);
   FileWrite(handle,g_ingestion_endpoint);
   FileWrite(handle,g_refresh_endpoint);
   FileWrite(handle,(string)g_sequence);
   FileClose(handle);
  }
