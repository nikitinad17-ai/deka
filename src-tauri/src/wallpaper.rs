//! Windows-only shell placement; audio and the existing WebView are never recreated.
//! WorkerW is a shell implementation detail; all failures detach to an ordinary window.
use std::{sync::Mutex, time::Duration};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::tray::TrayIconBuilder;

type Hwnd=isize;
#[repr(C)] #[derive(Default, Clone, Copy)] struct Rect{left:i32,top:i32,right:i32,bottom:i32}
#[repr(C)] #[derive(Default)] struct Point{x:i32,y:i32}
#[repr(C)] struct HostClass{
 style:u32,procedure:Option<unsafe extern "system" fn(Hwnd,u32,usize,isize)->isize>,
 class_extra:i32,window_extra:i32,instance:Hwnd,icon:Hwnd,cursor:Hwnd,background:Hwnd,
 menu:*const u16,name:*const u16
}
#[link(name="kernel32")] extern "system"{fn GetModuleHandleW(name:*const u16)->Hwnd;fn SetLastError(error:u32);fn GetLastError()->u32;fn GetCurrentProcessId()->u32;}
#[link(name="user32")] extern "system" {
 fn RegisterClassW(class:*const HostClass)->u16;
 fn DefWindowProcW(window:Hwnd,message:u32,wparam:usize,lparam:isize)->isize;
 fn FindWindowW(class:*const u16,title:*const u16)->Hwnd;
 fn FindWindowExW(parent:Hwnd,after:Hwnd,class:*const u16,title:*const u16)->Hwnd;
 fn EnumWindows(callback:unsafe extern "system" fn(Hwnd,isize)->i32,param:isize)->i32;
 fn GetWindowLongPtrW(window:Hwnd,index:i32)->isize;
 fn SetWindowLongPtrW(window:Hwnd,index:i32,value:isize)->isize;
 fn SetParent(window:Hwnd,parent:Hwnd)->Hwnd;
 fn GetParent(window:Hwnd)->Hwnd;
 fn GetAncestor(window:Hwnd,flags:u32)->Hwnd;
 fn GetWindowDpiAwarenessContext(window:Hwnd)->Hwnd;
 fn GetDpiForWindow(window:Hwnd)->u32;
 fn SetThreadDpiAwarenessContext(context:Hwnd)->Hwnd;
 fn IsZoomed(window:Hwnd)->i32;
 fn GetWindow(window:Hwnd,command:u32)->Hwnd;
 fn GetClassNameW(window:Hwnd,name:*mut u16,size:i32)->i32;
 fn GetWindowRect(window:Hwnd,rect:*mut Rect)->i32;
 fn SetWindowPos(window:Hwnd,after:Hwnd,x:i32,y:i32,w:i32,h:i32,flags:u32)->i32;
 fn EnableWindow(window:Hwnd,enabled:i32)->i32;
 fn ShowWindow(window:Hwnd,command:i32)->i32;
 fn SetForegroundWindow(window:Hwnd)->i32;
 fn SetFocus(window:Hwnd)->Hwnd;
 fn IsWindow(window:Hwnd)->i32;
 fn IsWindowVisible(window:Hwnd)->i32;
 fn IsIconic(window:Hwnd)->i32;
 fn GetForegroundWindow()->Hwnd;
 fn GetWindowThreadProcessId(window:Hwnd,pid:*mut u32)->u32;
 fn SendMessageTimeoutW(window:Hwnd,message:u32,wparam:usize,lparam:isize,flags:u32,timeout:u32,result:*mut usize)->isize;
 fn CreateWindowExW(ex:u32,class:*const u16,title:*const u16,style:u32,x:i32,y:i32,w:i32,h:i32,parent:Hwnd,menu:Hwnd,instance:Hwnd,param:*mut std::ffi::c_void)->Hwnd;
 fn DestroyWindow(window:Hwnd)->i32;
 fn MapWindowPoints(from:Hwnd,to:Hwnd,points:*mut Point,count:u32)->i32;
 fn SetLayeredWindowAttributes(window:Hwnd,color:u32,alpha:u8,flags:u32)->i32;
}
const CHILD:isize=0x40000000;const POPUP:isize=0x80000000u32 as isize;
const TRANSPARENT:isize=0x20;const NOACTIVATE:isize=0x08000000;const TOOLWINDOW:isize=0x80;const APPWINDOW:isize=0x40000;
fn wide(s:&str)->Vec<u16>{s.encode_utf16().chain(Some(0)).collect()}
unsafe extern "system" fn host_procedure(h:Hwnd,message:u32,wparam:usize,lparam:isize)->isize{
 if message==0x0084{return -1;} // HTTRANSPARENT: desktop owns all pointer input.

 DefWindowProcW(h,message,wparam,lparam)
}
fn register_host()->Result<(),String>{
 let name=wide("DekaWallpaperHost");
 let class=HostClass{style:0,procedure:Some(host_procedure),class_extra:0,window_extra:0,instance:unsafe{GetModuleHandleW(std::ptr::null())},icon:0,cursor:0,background:0,menu:std::ptr::null(),name:name.as_ptr()};
 let atom=unsafe{RegisterClassW(&class)};
 if atom==0&&std::io::Error::last_os_error().raw_os_error()!=Some(1410){return Err(format!("Не удалось подготовить слой обоев: {}",std::io::Error::last_os_error()));}
 Ok(())
}
fn find(class:&str)->Hwnd{unsafe{FindWindowW(wide(class).as_ptr(),std::ptr::null())}}
fn child(parent:Hwnd,class:&str)->Hwnd{unsafe{FindWindowExW(parent,0,wide(class).as_ptr(),std::ptr::null())}}
fn main_window(app:&AppHandle)->Result<WebviewWindow,String>{app.get_webview_window("main").ok_or("Окно не найдено".into())}
fn hwnd(w:&WebviewWindow)->Result<Hwnd,String>{w.hwnd().map(|h|h.0 as Hwnd).map_err(|e|e.to_string())}
#[derive(Clone)]struct Screen{name:String,x:i32,y:i32,width:u32,height:u32,scale:f64}
fn screens(app:&AppHandle)->Vec<Screen>{app.available_monitors().unwrap_or_default().iter().map(|m|Screen{name:m.name().cloned().unwrap_or_else(||"Монитор".into()),x:m.position().x,y:m.position().y,width:m.size().width,height:m.size().height,scale:m.scale_factor()}).collect()}
fn screen_json(s:&Screen)->Value{json!({"name":s.name,"x":s.x,"y":s.y,"width":s.width,"height":s.height,"scale":s.scale})}
#[derive(Default)]struct Session{mode:String,hotkey_registered:bool,selected:String,host:Hwnd,display:Hwnd,shell:Hwnd,icons:Hwnd,icon_root:Hwnd,raised:bool,shell_pid:u32,rect:Rect,style:isize,ex:isize,error:String,recoveries:u32,quiet:bool,geometry:String,tray_attempts:u8,tray_shell:Hwnd,attachment:Vec<Value>}
pub struct Wallpaper(Mutex<Session>);
fn configuration(app:&AppHandle)->Option<std::path::PathBuf>{app.path().app_config_dir().ok().map(|p|p.join("wallpaper-settings.json"))}
fn journal(app:&AppHandle)->Option<std::path::PathBuf>{configuration(app).map(|p|p.with_file_name("wallpaper-diagnostics.jsonl"))}
unsafe extern "system" fn shell_description(h:Hwnd,param:isize)->i32{
 let rows=&mut*(param as *mut Vec<Value>);let class=class_of(h);
 if class=="Progman"||class=="WorkerW"{
  let mut r=Rect::default();GetWindowRect(h,&mut r);
  rows.push(json!({"hwnd":h,"class":class,"pid":process_of(h),"visible":IsWindowVisible(h)!=0,"icons":child(h,"SHELLDLL_DefView"),"child_worker":child(h,"WorkerW"),"style":GetWindowLongPtrW(h,-16),"ex_style":GetWindowLongPtrW(h,-20),"rect":[r.left,r.top,r.right,r.bottom],"native":window_details(h)}));
 }1
}
fn record(app:&AppHandle,event:&str,state:Value){
 use std::io::Write;
 let Some(p)=journal(app)else{return;};if let Some(dir)=p.parent(){let _=std::fs::create_dir_all(dir);}
 if std::fs::metadata(&p).map(|m|m.len()>262144).unwrap_or(false){let _=std::fs::rename(&p,p.with_extension("previous.jsonl"));}
 let mut shell:Vec<Value>=Vec::new();unsafe{EnumWindows(shell_description,&mut shell as *mut Vec<Value> as isize);}
 let row=json!({"event":event,"state":state,"shell":shell,"time":std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs()});
 if let Ok(mut f)=std::fs::OpenOptions::new().create(true).append(true).open(p){let _=writeln!(f,"{row}");}
}
fn save(app:&AppHandle,s:&Session){if let Some(p)=configuration(app){if let Some(dir)=p.parent(){let _=std::fs::create_dir_all(dir);}let _=std::fs::write(p,json!({"selected_monitor":s.selected,"autostart":false}).to_string());}}
#[derive(Default,Clone,Copy)]struct Layer{parent:Hwnd,icons:Hwnd,icon_root:Hwnd,raised:bool,pid:u32}
fn owned_window(h:Hwnd)->bool{h!=0&&unsafe{IsWindow(h)!=0&&process_of(h)==GetCurrentProcessId()}}
fn native_parent(h:Hwnd)->Hwnd{unsafe{GetAncestor(h,1)}} // GA_PARENT ignores popup ownership rules.
fn window_details(h:Hwnd)->Value{unsafe{
 let mut pid=0;let thread=GetWindowThreadProcessId(h,&mut pid);let mut r=Rect::default();GetWindowRect(h,&mut r);
 json!({"hwnd":h,"valid":IsWindow(h)!=0,"pid":pid,"thread":thread,"get_parent":GetParent(h),"ancestor_parent":GetAncestor(h,1),"style":GetWindowLongPtrW(h,-16),"ex_style":GetWindowLongPtrW(h,-20),"visible":IsWindowVisible(h)!=0,"dpi_context":GetWindowDpiAwarenessContext(h),"dpi":GetDpiForWindow(h),"rect":[r.left,r.top,r.right,r.bottom]})
}}
fn attach_window(s:&mut Session,name:&str,h:Hwnd,parent:Hwnd)->Result<(),String>{unsafe{
 let before=window_details(h);let parent_before=window_details(parent);
 SetLastError(0);let previous=SetParent(h,parent);let error=GetLastError(); // Capture before any other Win32 call.
 let actual=native_parent(h);
 // SetParent can synchronously dispatch framework/DPI events which rewrite
 // top-level style bits. Preserve the real ancestry, then restore child style.
 if actual==parent{let style=GetWindowLongPtrW(h,-16);SetWindowLongPtrW(h,-16,(style&!POPUP)|CHILD);}
 let after=window_details(h);
 s.attachment.push(json!({"step":name,"before":before,"target":parent_before,"previous_parent":previous,"last_error":error,"actual_parent":actual,"after":after}));
 if actual!=parent{return Err(format!("{name}: окно {h} → {parent}, получен родитель {actual}; код {error}"));}
 if GetWindowLongPtrW(h,-16)&CHILD==0{return Err(format!("{name}: Windows не сохранила дочерний стиль окна"));}
 Ok(())
}}
// Create a child in Explorer at birth. On some classic Win10 desktops a
// cross-process SetParent on an existing top-level WebView returns zero with
// no error and leaves GA_PARENT unchanged. Only attach the WebView locally.
fn attach_classic_display(s: &mut Session, display: Hwnd, worker: Hwnd) -> Result<(), String> {
    unsafe {
        let instance = GetModuleHandleW(std::ptr::null());
        let class = wide("DekaWallpaperHost");
        let title = wide("Deka Wallpaper Host");
        let previous_dpi = SetThreadDpiAwarenessContext(GetWindowDpiAwarenessContext(display));
        SetLastError(0);
        let host = CreateWindowExW(
            (TRANSPARENT | NOACTIVATE | TOOLWINDOW) as u32,
            class.as_ptr(), title.as_ptr(), (CHILD | 0x04000000 | 0x02000000) as u32,
            0, 0, 1, 1, worker, 0, instance, std::ptr::null_mut(),
        );
        let error = GetLastError();
        if previous_dpi != 0 { SetThreadDpiAwarenessContext(previous_dpi); }
        let parent = if host != 0 { native_parent(host) } else { 0 };
        s.attachment.push(json!({
            "step": "create-in-worker", "target": worker, "host": host,
            "actual_parent": parent, "last_error": error
        }));
        if host != 0 && parent == worker {
            s.host = host;
            if attach_window(s, "display-to-local-host", display, host).is_ok() {
                return Ok(());
            }
        }
        // Retain RC1's proven direct route on shells that reject a native
        // host. Do not destroy a host while the display is its child.
        if host != 0 {
            if native_parent(display) == host {
                return Err("Не удалось подготовить дочернее окно отображения".into());
            }
            DestroyWindow(host);
            s.host = 0;
        }
        attach_window(s, "display-to-desktop-fallback", display, worker)
    }
}
fn process_of(h:Hwnd)->u32{let mut pid=0;unsafe{GetWindowThreadProcessId(h,&mut pid);}pid}
fn class_of(h:Hwnd)->String{let mut name=[0u16;256];let n=unsafe{GetClassNameW(h,name.as_mut_ptr(),256)};String::from_utf16_lossy(&name[..n.max(0) as usize])}
fn below(lower:Hwnd,upper:Hwnd)->bool{
 if lower==0||upper==0||lower==upper{return false;}
 let mut h=unsafe{GetWindow(lower,3)}; // GW_HWNDPREV: toward the top of this sibling stack.
 for _ in 0..4096{if h==upper{return true;}if h==0{break;}h=unsafe{GetWindow(h,3)};}
 false
}
unsafe extern "system" fn find_classic(top:Hwnd,param:isize)->i32{
 let layer=&mut*(param as *mut Layer);let def=child(top,"SHELLDLL_DefView");
 if def==0||process_of(top)!=layer.pid||IsWindowVisible(def)==0{return 1;}
 let mut next=FindWindowExW(0,top,wide("WorkerW").as_ptr(),std::ptr::null());
 while next!=0{
  let mut r=Rect::default();GetWindowRect(next,&mut r);
  if process_of(next)==layer.pid&&child(next,"SHELLDLL_DefView")==0&&IsWindowVisible(next)!=0&&r.right>r.left&&r.bottom>r.top&&below(next,top){
   layer.parent=next;layer.icons=def;layer.icon_root=top;return 0;
  }
  next=FindWindowExW(0,next,wide("WorkerW").as_ptr(),std::ptr::null());
 }1
}
fn shell_layer()->Result<Layer,String>{
 let prog=find("Progman");if prog==0{return Err("Проводник Windows недоступен".into());}
 unsafe{
  // Complete the raise request; 13/0 is only a preparation message and can
  // leave a stale WorkerW that is not a visible wallpaper surface on Win10.
  for(l,r)in[(0xDu64,1isize),(0,0)]{
   let mut result=0;
   let sent=SendMessageTimeoutW(prog,0x052C,l as usize,r,2,700,&mut result);
   eprintln!("Wallpaper shell request {l}/{r}: sent={sent}, result={result}, error={}",std::io::Error::last_os_error());
   // New raised desktops must be selected before classic sibling WorkerWs.
   if GetWindowLongPtrW(prog,-20)&0x00200000!=0{
    let def=child(prog,"SHELLDLL_DefView");let worker=child(prog,"WorkerW");
    if def!=0&&worker!=0&&IsWindowVisible(def)!=0&&below(worker,def){return Ok(Layer{parent:prog,icons:def,icon_root:prog,raised:true,pid:process_of(prog)});}
   }else{
    let mut layer=Layer{pid:process_of(prog),..Default::default()};EnumWindows(find_classic,&mut layer as *mut Layer as isize);
    if layer.parent!=0{return Ok(layer);}
   }
  }
  // A valid parent HWND alone does not prove a visible wallpaper layer.
  // Unsupported/failed shell integration must keep an accessible window.
 }
 Err("Windows не предоставила слой обоев; возвращаю обычное окно".into())
}
fn rect_visible(r:Rect,all:&[Screen])->bool{all.iter().any(|m|r.right>m.x+64&&r.left<m.x+m.width as i32-64&&r.bottom>m.y+64&&r.top<m.y+m.height as i32-64)}
fn display_window(app:&AppHandle)->Option<WebviewWindow>{
 app.webview_windows().into_values().find(|w|w.label().starts_with("wallpaper-display-")&&hwnd(w).map(owned_window).unwrap_or(false))
}
fn ensure_display(app:&AppHandle)->Result<(),String>{
 static SERIAL:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(0);
 static CREATION:Mutex<()>=Mutex::new(());
 let _lock=CREATION.lock().map_err(|_|"Экран обоев занят")?;
 if display_window(app).is_some(){return Ok(());}
 // Explorer can destroy a native HWND without releasing Tauri's old label.
 // Retire stale wrappers and use a fresh label for this passive generation.
 for w in app.webview_windows().into_values().filter(|w|w.label().starts_with("wallpaper-display-")){let _=w.destroy();}
 let label=format!("wallpaper-display-{}",SERIAL.fetch_add(1,std::sync::atomic::Ordering::Relaxed));
 tauri::WebviewWindowBuilder::new(app,label,tauri::WebviewUrl::App("wallpaper-display.html".into()))
  .title("Deka Wallpaper Display").visible(false).focused(false).decorations(false).skip_taskbar(true)
  .additional_browser_args(crate::BROWSER_ARGS).build().map(|_|()).map_err(|e|e.to_string())
}

fn ordinary(app:&AppHandle,w:&WebviewWindow,s:&mut Session,focus:bool)->Result<(),String>{
 let h=hwnd(w)?;
 unsafe{if owned_window(s.display){ShowWindow(s.display,0);SetParent(s.display,0);SetWindowLongPtrW(s.display,-16,POPUP);}
 EnableWindow(h,1);SetParent(h,0);SetWindowLongPtrW(h,-16,s.style);SetWindowLongPtrW(h,-20,s.ex);if owned_window(s.host){DestroyWindow(s.host);}s.host=0;s.display=0;}
 // Window setters in winit are queued and reapply cached top-level styles.
 // Keep native parenting/style changes in one Win32 transaction instead.
 unsafe{ShowWindow(h,if focus{9}else{0});}
 let all=screens(app);let mut r=s.rect;
 if !rect_visible(r,&all){if let Some(m)=all.first(){r=Rect{left:m.x+20,top:m.y+20,right:m.x+20+(m.width.saturating_sub(40).min(1120))as i32,bottom:m.y+20+(m.height.saturating_sub(80).min(780))as i32};}}
 if r.right>r.left&&r.bottom>r.top{unsafe{SetWindowPos(h,0,r.left,r.top,r.right-r.left,r.bottom-r.top,0x10|0x20|if focus{0x40}else{0});}}
 s.mode="normal".into();s.shell=0;s.icons=0;s.icon_root=0;s.shell_pid=0;unsafe{SetWindowPos(h,-2,0,0,0,0,0x10|0x1|0x2|0x20|if focus{0x40}else{0});if focus{ShowWindow(h,5);SetForegroundWindow(h);SetFocus(h);}}Ok(())
}
fn attached(h:Hwnd,s:&Session)->bool{unsafe{
 if !owned_window(h)||IsWindow(s.shell)==0||process_of(s.shell)!=s.shell_pid||IsWindowVisible(s.icons)==0{return false;}
 let surface=if s.host==0{h}else{s.host};
 native_parent(h)==(if s.host==0{s.shell}else{s.host})&&native_parent(surface)==s.shell&&
 GetWindowLongPtrW(h,-16)&CHILD!=0&&GetWindowLongPtrW(surface,-16)&CHILD!=0&&
 IsWindowVisible(h)!=0&&IsWindowVisible(surface)!=0&&
 if s.raised{below(surface,s.icons)}else{below(s.shell,s.icon_root)}
}}
fn notify(app:&AppHandle,s:&Session){let _=app.emit_to("main","wallpaper:state",json!({"mode":s.mode,"selected":s.selected,"error":s.error,"quiet":s.quiet,"recoveries":s.recoveries}));}
fn place(app:&AppHandle,requested:&str,monitor:Option<String>)->Result<Value,String>{
 if !["normal","active","background"].contains(&requested){return Err("Неизвестный режим".into());}
 let w=main_window(app)?;let h=hwnd(&w)?;let state=app.state::<Wallpaper>();let mut s=state.0.lock().map_err(|_|"Состояние занято")?;
 if s.mode=="normal"{unsafe{if IsZoomed(h)==0&&IsIconic(h)==0{GetWindowRect(h,&mut s.rect);}}s.style=unsafe{GetWindowLongPtrW(h,-16)}&!0x21000000;s.ex=unsafe{GetWindowLongPtrW(h,-20)};}
 if let Some(name)=monitor{s.selected=name;}
 s.error.clear();s.attachment.clear();ordinary(app,&w,&mut s,requested!="background")?;
 if requested!="normal"{
  let all=screens(app);let selected=all.iter().find(|m|m.name==s.selected).or_else(||all.first()).ok_or("Нет доступного монитора")?.clone();s.selected=selected.name.clone();
  if requested=="active"{
   unsafe{SetWindowLongPtrW(h,-16,(s.style&!CHILD&!0x00C40000)|POPUP);SetWindowPos(h,0,selected.x,selected.y,selected.width as i32,selected.height as i32,0x20|0x40);}
   s.mode="active".into();unsafe{ShowWindow(h,5);SetForegroundWindow(h);}
  }else{
   let display=display_window(app).ok_or("Экран обоев ещё не готов")?;let display_h=hwnd(&display)?;
   match shell_layer(){
    Ok(layer)=>unsafe{
     let Layer{parent,icons:def,icon_root,raised,..}=layer;
     // Never reparent the foreground player into Explorer. Activating that
     // child can raise its whole WorkerW over the icon window on Windows 10.
     if GetForegroundWindow()==h{SetForegroundWindow(icon_root);}ShowWindow(h,0);
     // Size the hidden, top-level player for an exact 1:1 passive DOM mirror.
     SetWindowLongPtrW(h,-16,(s.style&!CHILD&!0x00C40000&!0x10000000)|POPUP);
     SetWindowPos(h,-2,selected.x,selected.y,selected.width as i32,selected.height as i32,0x10|0x20);
     ShowWindow(h,0); // Resizing must not reintroduce the cached WS_VISIBLE bit.
     let h=display_h;
     let mut point=Point{x:selected.x,y:selected.y};MapWindowPoints(0,parent,&mut point,1);
     s.display=h;s.shell=parent;s.icons=def;s.icon_root=icon_root;s.raised=raised;s.shell_pid=process_of(parent);
     ShowWindow(h,0);
     // Use the display's own styles, never the player's cached top-level bits.
     let style=GetWindowLongPtrW(h,-16);
     SetWindowLongPtrW(h,-16,(style&!POPUP&!0x00C40000&!0x10000000)|CHILD|0x04000000);
     SetWindowLongPtrW(h,-20,(GetWindowLongPtrW(h,-20)&!APPWINDOW)|TOOLWINDOW|NOACTIVATE|TRANSPARENT);
     let result=if !raised{
      attach_classic_display(&mut s,h,parent)
     }else{
      // Raised desktops need a layered compositing host. Create it with the
      // display's DPI awareness, restoring the UI thread context immediately.
      let previous_dpi=SetThreadDpiAwarenessContext(GetWindowDpiAwarenessContext(h));
      SetLastError(0);
      let host=CreateWindowExW((TRANSPARENT|NOACTIVATE|TOOLWINDOW|0x80000)as u32,wide("DekaWallpaperHost").as_ptr(),wide("Deka Wallpaper Host").as_ptr(),(POPUP|0x04000000|0x02000000)as u32,0,0,selected.width as i32,selected.height as i32,0,0,GetModuleHandleW(std::ptr::null()),std::ptr::null_mut());
      let creation_error=GetLastError();if previous_dpi!=0{SetThreadDpiAwarenessContext(previous_dpi);}
      if host==0{Err(format!("Создание слоя: код {creation_error}"))}else{
       s.host=host;SetWindowLongPtrW(host,-16,CHILD|0x04000000|0x02000000);
       attach_window(&mut s,"display-to-host",h,host).and_then(|_|attach_window(&mut s,"host-to-desktop",host,parent))
      }
     };
     match result{
      Err(error)=>{s.error=format!("Фон не включён. {error}");ordinary(app,&w,&mut s,true)?;},
      Ok(())=>{
       let surface=if s.host==0{h}else{s.host};
       if raised{SetLayeredWindowAttributes(surface,0,255,2);}
       SetWindowPos(surface,if raised{def}else{0},point.x,point.y,selected.width as i32,selected.height as i32,0x10|0x20|0x40);
       if s.host!=0{SetWindowPos(h,0,0,0,selected.width as i32,selected.height as i32,0x10|0x20|0x40);EnableWindow(s.host,0);}
       EnableWindow(h,0);s.mode="background".into();
       if !attached(h,&s)||IsWindowVisible(hwnd(&w)?)!=0{s.error="Фон не включён: не подтверждено размещение под ярлыками".into();s.attachment.push(json!({"step":"placement-check","display":window_details(h),"surface":window_details(surface),"engine":window_details(hwnd(&w)?)}));ordinary(app,&w,&mut s,true)?;}
      }
     }
    },
    Err(error)=>{s.error=error;ordinary(app,&w,&mut s,true)?;}
   }
  }
 }
 s.quiet=s.mode=="background";save(app,&s);notify(app,&s);let interactive = s.mode != "background";drop(s);
 if interactive {
     let view: &tauri::Webview = w.as_ref();
     let _ = view.set_focus();
 }
 let result=snapshot(app)?;record(app,requested,result.clone());Ok(result)
}
fn tray_registered(app:&AppHandle)->bool{
 // NIM_MODIFY succeeds for an existing icon even when Explorer puts it in
 // the closed overflow area, where Shell_NotifyIconGetRect can return None.
 app.tray_by_id("deka-wallpaper").map(|t|t.set_tooltip(Some("Deka · Плеер / DJ / Фон")).is_ok()).unwrap_or(false)
}
fn snapshot(app:&AppHandle)->Result<Value,String>{
 let w=main_window(app)?;let h=hwnd(&w)?;let state=app.state::<Wallpaper>();let s=state.0.lock().map_err(|_|"Состояние занято")?;
 let engine_h=h;let h=if s.mode=="background"{s.display}else{engine_h};
 let all=screens(app);let mut r=Rect::default();unsafe{GetWindowRect(h,&mut r);}
 let tray=app.tray_by_id("deka-wallpaper").is_some();let tray_rect=app.tray_by_id("deka-wallpaper").and_then(|t|t.rect().ok().flatten()).map(|r|format!("{r:?}"));
 Ok(json!({"version":app.package_info().version.to_string(),"hotkey_registered":s.hotkey_registered,"foreground":unsafe{GetForegroundWindow()},"mode":s.mode,"selected":s.selected,"monitors":all.iter().map(screen_json).collect::<Vec<_>>(),"engine_hwnd":engine_h,"engine_parent":unsafe{GetParent(engine_h)},"engine_visible":unsafe{IsWindowVisible(engine_h)!=0},"hwnd":h,"parent":unsafe{GetParent(h)},"host":s.host,"shell":s.shell,"shell_class":class_of(s.shell),"icons":s.icons,"icon_root":s.icon_root,"raised":s.raised,"placement_verified":s.mode=="background"&&attached(h,&s),"shell_pid":s.shell_pid,"style":unsafe{GetWindowLongPtrW(h,-16)},"ex_style":unsafe{GetWindowLongPtrW(h,-20)},"rect":{"x":r.left,"y":r.top,"width":r.right-r.left,"height":r.bottom-r.top},"tray":tray,"tray_registered":tray_registered(app),"tray_rect":tray_rect,"attachment":s.attachment,"engine_native":window_details(engine_h),"display_native":window_details(h),"tray_shell":s.tray_shell,"tray_attempts":s.tray_attempts,"error":s.error,"recoveries":s.recoveries,"settings_file":configuration(app),"autostart":false,"quiet":s.quiet}))
}
pub fn action(app:&AppHandle,id:&str){
 if id=="exit"{let _=place(app,"normal",None);app.exit(0);return;}
 if id=="open"{let _=place(app,"normal",None);return;}
 if let Some(name)=id.strip_prefix("monitor:"){let mode=app.state::<Wallpaper>().0.lock().unwrap().mode.clone();let _=place(app,&mode,Some(name.into()));return;}
 if id=="background"{let app=app.clone();std::thread::spawn(move||{let _=ensure_display(&app);let handle=app.clone();let _=app.run_on_main_thread(move||{let _=place(&handle,"background",None);});});return;}
 let _=place(app,id,None);
}
fn install_tray(app:&AppHandle)->tauri::Result<()>{
 let menu=Menu::new(app)?;
 for(id,text)in[("active","Активно"),("background","Фон"),("normal","Обычный режим"),("open","Открыть окно")]{menu.append(&MenuItem::with_id(app,id,text,true,None::<&str>)?)?;}
 let monitors=Submenu::new(app,"Выбор монитора",true)?;
 for(i,m)in screens(app).iter().enumerate(){monitors.append(&MenuItem::with_id(app,format!("monitor:{}",m.name),format!("{} · {} · {}×{} · {}%",i+1,m.name,m.width,m.height,(m.scale*100.)as u32),true,None::<&str>)?)?;}
 menu.append(&monitors)?;menu.append(&MenuItem::with_id(app,"exit","Выход",true,None::<&str>)?)?;
 let mut builder=TrayIconBuilder::with_id("deka-wallpaper").menu(&menu).tooltip("Deka · Плеер / DJ / Фон").show_menu_on_left_click(true);
 if let Some(icon)=app.default_window_icon(){builder=builder.icon(icon.clone());}builder.build(app)?;Ok(())
}
fn install_mode_shortcut(app: &AppHandle) -> tauri::Result<bool> {
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
    let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::F9);
    app.plugin(tauri_plugin_global_shortcut::Builder::new().build())?;
    let registered = app.global_shortcut().on_shortcut(shortcut, |app, _, event| {
        if event.state() == ShortcutState::Pressed {
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || {
                let active = handle.state::<Wallpaper>().0.lock().unwrap().mode == "active";
                action(&handle, if active { "background" } else { "active" });
            });
        }
    });
    if let Err(error) = &registered {
        eprintln!("Wallpaper shortcut Ctrl+Alt+F9 unavailable: {error}");
    }
    Ok(registered.is_ok())
}

pub fn setup(app:&AppHandle)->Result<(),Box<dyn std::error::Error>>{
 register_host()?;
 let w=main_window(app)?;let h=hwnd(&w)?;let mut rect=Rect::default();unsafe{GetWindowRect(h,&mut rect);}
 let selected=configuration(app).and_then(|p|std::fs::read_to_string(p).ok()).and_then(|s|serde_json::from_str::<Value>(&s).ok()).and_then(|v|v["selected_monitor"].as_str().map(str::to_owned)).unwrap_or_default();
 app.manage(Wallpaper(Mutex::new(Session{mode:"normal".into(),selected,rect,style:unsafe{GetWindowLongPtrW(h,-16)},ex:unsafe{GetWindowLongPtrW(h,-20)},..Default::default()})));
 let hotkey_registered = install_mode_shortcut(app).unwrap_or_else(|error| {
     eprintln!("Wallpaper shortcut setup failed: {error}");
     false
 });
 app.state::<Wallpaper>().0.lock().unwrap().hotkey_registered = hotkey_registered;
 app.on_menu_event(|app,event|action(app,event.id.as_ref()));
 install_tray(app)?;
 let app=app.clone();std::thread::spawn(move||{loop{
  std::thread::sleep(Duration::from_millis(1000));let handle=app.clone();let _=app.run_on_main_thread(move||{
   let all=screens(&handle);let geometry=all.iter().map(|m|format!("{}:{},{},{},{}:{}",m.name,m.x,m.y,m.width,m.height,m.scale)).collect::<Vec<_>>().join("|");
   let shell=find("Shell_TrayWnd");
   let st=handle.state::<Wallpaper>();let mut s=st.0.lock().unwrap();let mut recover=false;
   // Observe and update shell identity in the same UI-thread transaction.
   // Probe registration, not geometry: a valid icon can be in closed overflow.
   let tray_visible=tray_registered(&handle);
   if shell!=s.tray_shell{s.tray_attempts=0;s.tray_shell=shell;}
   if shell!=0&&!tray_visible&&s.tray_attempts<10{
    s.tray_attempts+=1;let _=handle.remove_tray_by_id("deka-wallpaper");
    let result=install_tray(&handle);eprintln!("Wallpaper tray recovery attempt {}: {:?}",s.tray_attempts,result);
   }else if tray_visible{s.tray_attempts=0;}
   if s.mode!="normal"{
    if !all.iter().any(|m|m.name==s.selected){s.error="Монитор отключён; возвращено обычное окно".into();recover=true;}
    else if s.mode=="background"&&(!attached(s.display,&s)||main_window(&handle).and_then(|w|hwnd(&w)).map(|h|unsafe{IsWindowVisible(h)!=0}).unwrap_or(true)){s.error="Слой обоев изменился; управление восстановлено в окне".into();recover=true;}
    else if s.geometry!=geometry&&!s.geometry.is_empty(){let mode=s.mode.clone();let name=s.selected.clone();s.geometry=geometry.clone();drop(s);let _=place(&handle,&mode,Some(name));return;}
   }
   s.geometry=geometry;
   if recover{if let Ok(w)=main_window(&handle){
    let failed=json!({"step":"watchdog-recovery","display":window_details(s.display),"host":window_details(s.host),"shell":window_details(s.shell),"engine":window_details(hwnd(&w).unwrap_or(0))});s.attachment.push(failed);
    let _=ordinary(&handle,&w,&mut s,true);s.recoveries+=1;notify(&handle,&s);
    drop(s);if let Ok(state)=snapshot(&handle){record(&handle,"watchdog-recovery",state);}return;
   }}
   else if let Ok(w)=main_window(&handle){if let Ok(h)=hwnd(&w){let mut front=Rect::default();let mut ours=Rect::default();let fg=unsafe{GetForegroundWindow()};unsafe{GetWindowRect(fg,&mut front);GetWindowRect(h,&mut ours);}
    let covered=fg!=h&&front.left<=ours.left&&front.top<=ours.top&&front.right>=ours.right&&front.bottom>=ours.bottom;
    let quiet=s.mode=="background"||unsafe{IsIconic(h)}!=0||unsafe{IsWindowVisible(h)}==0||covered;
    if s.quiet!=quiet{s.quiet=quiet;notify(&handle,&s);}
   }}
  });
 }});Ok(())
}
#[tauri::command]
pub fn wallpaper_mirror(app:AppHandle,window:WebviewWindow,frame:Value)->Result<(),String>{
 if window.label()!="main"{return Err("Недоступно".into());}
 if let Some(display)=display_window(&app){app.emit_to(display.label(),"wallpaper:frame",frame).map_err(|e|e.to_string())}else{Ok(())}
}
#[tauri::command]
pub fn wallpaper_display_ready(app:AppHandle,window:WebviewWindow)->Result<(),String>{
 if !window.label().starts_with("wallpaper-display-"){return Err("Недоступно".into());}
 app.emit_to("main","wallpaper:mirror-request",()).map_err(|e|e.to_string())
}
#[tauri::command]
pub async fn wallpaper_report(app:AppHandle,window:WebviewWindow)->Result<String,String>{
 if window.label()!="main"{return Err("Недоступно".into());}
 let source=journal(&app).ok_or("Папка отчёта недоступна")?;
 let data=std::fs::read_to_string(source).map_err(|e|e.to_string())?;
 let target=app.path().download_dir().map_err(|e|e.to_string())?.join("Deka-Wallpaper-diagnostics.txt");
 std::fs::write(&target,format!("Deka 0.19.0 Preview — размещение окна и слои Explorer; без списка музыки.\n{data}")).map_err(|e|e.to_string())?;
 Ok(target.to_string_lossy().into_owned())
}
#[tauri::command]
pub async fn wallpaper_state(app:AppHandle,window:WebviewWindow)->Result<Value,String>{if window.label()!="main"{return Err("Недоступно".into());}let(tx,rx)=std::sync::mpsc::channel();let h=app.clone();app.run_on_main_thread(move||{let _=tx.send(snapshot(&h));}).map_err(|e|e.to_string())?;rx.recv_timeout(Duration::from_secs(8)).map_err(|e|e.to_string())?}
#[tauri::command]
pub async fn wallpaper_set(app:AppHandle,window:WebviewWindow,mode:String,monitor:Option<String>)->Result<Value,String>{if window.label()!="main"{return Err("Недоступно".into());}if mode=="background"{ensure_display(&app)?;}let(tx,rx)=std::sync::mpsc::channel();let h=app.clone();app.run_on_main_thread(move||{let _=tx.send(place(&h,&mode,monitor));}).map_err(|e|e.to_string())?;rx.recv_timeout(Duration::from_secs(10)).map_err(|e|e.to_string())?}
#[tauri::command]
pub async fn wallpaper_exit(app:AppHandle,window:WebviewWindow)->Result<(),String>{if window.label()!="main"{return Err("Недоступно".into());}let h=app.clone();app.run_on_main_thread(move||action(&h,"exit")).map_err(|e|e.to_string())}
#[cfg(test)]mod tests{use super::*;#[test]fn negative_and_mixed_dpi_monitor_rects(){let screens=[Screen{name:"A".into(),x:-1920,y:0,width:1920,height:1080,scale:1.},Screen{name:"B".into(),x:0,y:-300,width:2560,height:1440,scale:1.5}];assert!(rect_visible(Rect{left:-1700,top:40,right:-700,bottom:800},&screens));assert!(rect_visible(Rect{left:200,top:-220,right:1400,bottom:600},&screens));assert!(!rect_visible(Rect{left:5000,top:0,right:6000,bottom:800},&screens));assert!(!rect_visible(Rect{left:-1700,top:40,right:-700,bottom:800},&screens[1..]));}}

#[cfg(test)] mod attachment_tests {
 use super::*;
 unsafe fn window()->Hwnd {
  let h=CreateWindowExW(TOOLWINDOW as u32,wide("DekaWallpaperHost").as_ptr(),wide("Deka attachment test").as_ptr(),POPUP as u32,0,0,80,60,0,0,GetModuleHandleW(std::ptr::null()),std::ptr::null_mut());
  assert_ne!(h,0);h
 }
 #[test] fn native_parent_and_error_are_recorded_before_cleanup(){unsafe{
  register_host().unwrap();let parent=window();let display=window();let mut s=Session::default();
  assert!(attach_window(&mut s,"invalid-target",display,isize::MAX).is_err());
  let failure=s.attachment.last().unwrap();assert_eq!(failure["last_error"],1400);assert_ne!(failure["actual_parent"],isize::MAX);
  // Even if the input starts as a POPUP, a successful attachment must end
  // with real native ancestry and a CHILD style, rather than owner inference.
  attach_window(&mut s,"valid-target",display,parent).unwrap();
  assert_eq!(native_parent(display),parent);assert_ne!(GetWindowLongPtrW(display,-16)&CHILD,0);
  assert_eq!(s.attachment.last().unwrap()["last_error"],0);
  DestroyWindow(parent);
 }}
 #[test] fn user_two_monitor_geometry_accepts_right_display(){
  let monitors=[Screen{name:"right".into(),x:1920,y:0,width:1920,height:1080,scale:1.},Screen{name:"left".into(),x:0,y:0,width:1920,height:1080,scale:1.}];
  assert!(rect_visible(Rect{left:1920,top:0,right:3840,bottom:1080},&monitors));
  assert!(!rect_visible(Rect{left:3840,top:0,right:5760,bottom:1080},&monitors));
 }
}
