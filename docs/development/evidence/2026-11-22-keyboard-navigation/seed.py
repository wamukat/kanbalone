"""Create identical disposable fixtures on the two dedicated verification instances."""
import json, urllib.request, sys

def call(base, method, path, data=None):
    req=urllib.request.Request(base+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json'},method=method)
    return json.load(urllib.request.urlopen(req))
for base in sys.argv[1:]:
    b=call(base,'POST','/api/boards',{'name':'Keyboard navigation QA','laneNames':['todo','doing','Acceptance']})
    lanes=b['lanes']+[call(base,'POST',f"/api/boards/{b['board']['id']}/lanes",{'name':'done','isCompletionLane':True})]
    titles=[['Retry delivery','Show failure reason','Explain recipient settings','Preserve line breaks','Prevent duplicate delivery','Check retry limit','Handle offline delivery','Display delivery time','Review timeout message','Keep delivery history','Explain opt-out','Check empty recipient'],['Show delivery history','Save preferences','Validate recipients','Handle expired token','Test retry delay','Review notification text','Keep unread state','Check settings'],['Update the user guide','Review first-run hints'],['Explain delivery settings','Verify schedule','Sort history','Record verification','Improve old messages','Add recipient examples','Clean up settings','Document defaults']]
    for lane,ns in zip(lanes,titles):
        for i,title in enumerate(ns):
            call(base,'POST',f"/api/boards/{b['board']['id']}/tickets",{'laneId':lane['id'],'title':('Guide: ' if lane['name']=='Acceptance' else 'Notification: ')+title,'bodyMarkdown':'## Verification\n\nConfirm the behavior, then record the result.\n\nThis ticket is disposable test data.','priority':2})
    print(base,b['board']['id'])
