import pathlib,subprocess,json
out=pathlib.Path(__file__).resolve().parent;results=[]
def ab(*a):return subprocess.check_output(['agent-browser','--session','mock1511',*a],text=True)
def ev(s):return json.loads(ab('eval',s))
for lang in ['ja','en']:
 for view in ['list','kanban','group']:
  ab('open',f'http://127.0.0.1:3598/create-keyboard.html?lang={lang}&view={view}')
  ab('click','#mock-start')
  before=ev('({text:document.activeElement.textContent,scroll:window.scrollY})')
  ab('screenshot',str(out/f'{lang}-{view}-start.png'))
  ab('press','n');ab('fill','#mock-title','配信結果を確認する' if lang=='ja' else 'Verify notification delivery')
  ab('screenshot',str(out/f'{lang}-{view}-create.png'))
  ab('press','Control+Enter');ab('wait','--fn','!document.querySelector("dialog[open]")')
  after=ev('({text:document.activeElement.textContent,scroll:window.scrollY,saved:window.mockResults()})')
  assert before['text']==after['text'];assert len(after['saved'])==1
  ab('screenshot',str(out/f'{lang}-{view}-returned.png'))
  results.append(dict(lang=lang,view=view,before=before,after=after))
out.joinpath('verification.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps(results,ensure_ascii=False,indent=2))
