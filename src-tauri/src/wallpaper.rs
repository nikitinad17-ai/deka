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
#[link(name="user32")] extern "system" {
 fn FindWindowW(class:*const u16,title:*const u16)->Hwnd;
 fn FindWindowExW(parent:Hwnd,after:Hwnd,class:*const u16,title:*const u16)->Hwnd;
 fn EnumWindows(callback:unsafe extern "system" fn(Hwnd,isize)->i32,param:isize)->i32;
 fn GetWindowLongPtrW(window:Hwnd,index:i32)->isize;
 fn SetWindowLongPtrW(window:Hwnd,index:i32,value:isize)->isize;
 fn SetParent(window:Hwnd,parent:Hwnd)->Hwnd;
 fn GetParent(window:Hwnd)->Hwnd;
 fn GetWindowRect(window:Hwnd,rect:*mut Rect)->i32;
 fn SetWindowPos(window:Hwnd,after:Hwnd,x:i32,y:i32,w:i32,h:i32,flags:u32)->i32;
 fn EnableWindow(window:Hwnd,enabled:i32)->i32;
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
fn find(class:&str)->Hwnd{unsafe{FindWindowW(wide(class).as_ptr(),std::ptr::null())}}
fn child(parent:Hwnd,class:&str)->Hwnd{unsafe{FindWindowExW(parent,0,wide(class).as_ptr(),std::ptr::null())}}
fn main_window(app:&AppHandle)->Result<WebviewWindow,String>{app.get_webview_window("main").ok_or("Окно не найдено".into())}
fn hwnd(w:&WebviewWindow)->Result<Hwnd,String>{w.hwnd().map(|h|h.0 as Hwnd).map_err(|e|e.to_string())}
#[derive(Clone)]struct Screen{name:String,x:i32,y:i32,width:u32,height:u32,scale:f64}
fn screens(app:&AppHandle)->Vec<Screen>{app.available_monitors().unwrap_or_default().iter().map(|m|Screen{name:m.name().cloned().unwrap_or_else(||"Монитор".into()),x:m.position().x,y:m.position().y,width:m.size().width,height:m.size().height,scale:m.scale_factor()}).collect()}
fn screen_json(s:&Screen)->Value{json!({"name":s.name,"x":s.x,"y":s.y,"width":s.width,"height":s.height,"scale":s.scale})}
#[derive(Default)]struct Session{mode:String,selected:String,host:Hwnd,shell:Hwnd,shell_pid:u32,rect:Rect,style:isize,ex:isize,error:String,recoveries:u32,quiet:bool,geometry:String}
pub struct Wallpaper(Mutex<Session>);
fn configuration(app:&AppHandle)->Option<std::path::PathBuf>{app.path().app_config_dir().ok().map(|p|p.join("wallpaper-settings.json"))}
fn save(app:&AppHandle,s:&Session){if let Some(p)=configuration(app){if let Some(dir)=p.parent(){let _=std::fs::create_dir_all(dir);}let _=std::fs::write(p,json!({"selected_monitor":s.selected,"autostart":false}).to_string());}}
unsafe extern "system" fn find_classic(top:Hwnd,param:isize)->i32{
 if child(top,"SHELLDLL_DefView")!=0{let next=FindWindowExW(0,top,wide("WorkerW").as_ptr(),std::ptr::null());if next!=0{*(param as *mut Hwnd)=next;return 0;}}1
}
fn shell_layer()->Result<(Hwnd,Hwnd,bool),String>{
 let prog=find("Progman");if prog==0{return Err("Проводник Windows недоступен".into());}
 unsafe{
  // Inspect after each shell message: different Explorer generations handle
  // these forms differently, so a later request must not undo a valid layer.
  for(l,r)in[(0xDu64,0isize),(0xD,1),(0,0)]{
   let mut result=0;
   let sent=SendMessageTimeoutW(prog,0x052C,l as usize,r,2,700,&mut result);
   eprintln!("Wallpaper shell request {l}/{r}: sent={sent}, result={result}, error={}",std::io::Error::last_os_error());
   let mut worker=0;EnumWindows(find_classic,&mut worker as *mut Hwnd as isize);
   if worker!=0{return Ok((worker,0,false));}
   let def=child(prog,"SHELLDLL_DefView");let raised=child(prog,"WorkerW");
   if def!=0&&raised!=0{return Ok((prog,def,true));}
  }
  // Classic shells may keep DefView directly under Progman without creating
  // an empty WorkerW. Our layered host is placed behind the actual icon view,
  // never over it. Native acceptance verifies rendered screen pixels and input.
  let def=child(prog,"SHELLDLL_DefView");
  if def!=0{return Ok((prog,def,true));}
 }
 Err("Windows не предоставила слой обоев; возвращаю обычное окно".into())
}
fn rect_visible(r:Rect,all:&[Screen])->bool{all.iter().any(|m|r.right>m.x+64&&r.left<m.x+m.width as i32-64&&r.bottom>m.y+64&&r.top<m.y+m.height as i32-64)}
fn ordinary(app:&AppHandle,w:&WebviewWindow,s:&mut Session)->Result<(),String>{
 let h=hwnd(w)?;
 unsafe{EnableWindow(h,1);SetParent(h,0);SetWindowLongPtrW(h,-16,s.style);SetWindowLongPtrW(h,-20,s.ex);if s.host!=0&&IsWindow(s.host)!=0{DestroyWindow(s.host);}s.host=0;}
 let _=w.set_ignore_cursor_events(false);let _=w.set_decorations(true);let _=w.set_skip_taskbar(false);let _=w.set_always_on_top(false);let _=w.unminimize();
 let all=screens(app);let mut r=s.rect;
 if !rect_visible(r,&all){if let Some(m)=all.first(){r=Rect{left:m.x+20,top:m.y+20,right:m.x+20+(m.width.saturating_sub(40).min(1120))as i32,bottom:m.y+20+(m.height.saturating_sub(80).min(780))as i32};}}
 if r.right>r.left&&r.bottom>r.top{unsafe{SetWindowPos(h,0,r.left,r.top,r.right-r.left,r.bottom-r.top,0x20|0x40);}}
 s.mode="normal".into();s.shell=0;s.shell_pid=0;w.show().map_err(|e|e.to_string())?;let _=w.set_focus();Ok(())
}
fn notify(app:&AppHandle,s:&Session){let _=app.emit_to("main","wallpaper:state",json!({"mode":s.mode,"selected":s.selected,"error":s.error,"quiet":s.quiet,"recoveries":s.recoveries}));}
fn place(app:&AppHandle,requested:&str,monitor:Option<String>)->Result<Value,String>{
 if !["normal","active","background"].contains(&requested){return Err("Неизвестный режим".into());}
 let w=main_window(app)?;let h=hwnd(&w)?;let state=app.state::<Wallpaper>();let mut s=state.0.lock().map_err(|_|"Состояние занято")?;
 if s.mode=="normal"{unsafe{GetWindowRect(h,&mut s.rect);}s.style=unsafe{GetWindowLongPtrW(h,-16)};s.ex=unsafe{GetWindowLongPtrW(h,-20)};}
 if let Some(name)=monitor{s.selected=name;}
 s.error.clear();ordinary(app,&w,&mut s)?;
 if requested!="normal"{
  let all=screens(app);let selected=all.iter().find(|m|m.name==s.selected).or_else(||all.first()).ok_or("Нет доступного монитора")?.clone();s.selected=selected.name.clone();
  let _=w.set_decorations(false);let _=w.set_always_on_top(false);
  if requested=="active"{
   unsafe{SetWindowLongPtrW(h,-16,(s.style&!CHILD&!0x00C40000)|POPUP);SetWindowPos(h,0,selected.x,selected.y,selected.width as i32,selected.height as i32,0x20|0x40);}
   s.mode="active".into();w.show().map_err(|e|e.to_string())?;let _=w.set_focus();
  }else{
   match shell_layer(){
    Ok((parent,def,raised))=>unsafe{
     let mut point=Point{x:selected.x,y:selected.y};MapWindowPoints(0,parent,&mut point,1);
     let host=CreateWindowExW((TRANSPARENT|NOACTIVATE|if raised{0x80000}else{0})as u32,wide("Static").as_ptr(),wide("Deka Wallpaper Host").as_ptr(),(CHILD|0x10000000|0x04000000|0x02000000)as u32,point.x,point.y,selected.width as i32,selected.height as i32,parent,0,0,std::ptr::null_mut());
     if host==0{s.error=format!("Не удалось создать слой; обычное окно: {}",std::io::Error::last_os_error());ordinary(app,&w,&mut s)?;}else{
      s.host=host;if raised{SetLayeredWindowAttributes(host,0,255,2);SetWindowPos(host,def,point.x,point.y,selected.width as i32,selected.height as i32,0x10|0x40);}
      SetWindowLongPtrW(h,-16,(s.style&!POPUP&!0x00C40000)|CHILD);SetWindowLongPtrW(h,-20,(s.ex&!APPWINDOW)|TOOLWINDOW|NOACTIVATE|TRANSPARENT);SetParent(h,host);
      if GetParent(h)!=host{s.error=format!("Не удалось привязать к рабочему столу; обычное окно: {}",std::io::Error::last_os_error());ordinary(app,&w,&mut s)?;}else{
       SetWindowPos(h,0,0,0,selected.width as i32,selected.height as i32,0x10|0x20|0x40);EnableWindow(h,0);let _=w.set_ignore_cursor_events(true);let _=w.set_skip_taskbar(true);s.mode="background".into();s.shell=parent;GetWindowThreadProcessId(parent,&mut s.shell_pid);
      }
     }
    },
    Err(error)=>{s.error=error;ordinary(app,&w,&mut s)?;}
   }
  }
 }
 s.quiet=s.mode=="background";save(app,&s);notify(app,&s);drop(s);snapshot(app)
}
fn snapshot(app:&AppHandle)->Result<Value,String>{
 let w=main_window(app)?;let h=hwnd(&w)?;let state=app.state::<Wallpaper>();let s=state.0.lock().map_err(|_|"Состояние занято")?;
 let all=screens(app);let mut r=Rect::default();unsafe{GetWindowRect(h,&mut r);}
 let tray=app.tray_by_id("deka-wallpaper").is_some();let tray_rect=app.tray_by_id("deka-wallpaper").and_then(|t|t.rect().ok().flatten()).map(|r|format!("{r:?}"));
 Ok(json!({"mode":s.mode,"selected":s.selected,"monitors":all.iter().map(screen_json).collect::<Vec<_>>(),"hwnd":h,"parent":unsafe{GetParent(h)},"host":s.host,"shell":s.shell,"shell_pid":s.shell_pid,"style":unsafe{GetWindowLongPtrW(h,-16)},"ex_style":unsafe{GetWindowLongPtrW(h,-20)},"rect":{"x":r.left,"y":r.top,"width":r.right-r.left,"height":r.bottom-r.top},"tray":tray,"tray_rect":tray_rect,"error":s.error,"recoveries":s.recoveries,"settings_file":configuration(app),"autostart":false,"quiet":s.quiet}))
}
pub fn action(app:&AppHandle,id:&str){
 if id=="exit"{let _=place(app,"normal",None);app.exit(0);return;}
 if id=="open"{let _=place(app,"normal",None);return;}
 if let Some(name)=id.strip_prefix("monitor:"){let mode=app.state::<Wallpaper>().0.lock().unwrap().mode.clone();let _=place(app,&mode,Some(name.into()));return;}
 let _=place(app,id,None);
}
fn install_tray(app:&AppHandle)->tauri::Result<()>{
 let menu=Menu::new(app)?;
 for(id,text)in[("active","Активно"),("background","Фон"),("normal","Обычный режим"),("open","Открыть окно")]{menu.append(&MenuItem::with_id(app,id,text,true,None::<&str>)?)?;}
 let monitors=Submenu::new(app,"Выбор монитора",true)?;
 for(i,m)in screens(app).iter().enumerate(){monitors.append(&MenuItem::with_id(app,format!("monitor:{}",m.name),format!("{} · {} · {}×{} · {}%",i+1,m.name,m.width,m.height,(m.scale*100.)as u32),true,None::<&str>)?)?;}
 menu.append(&monitors)?;menu.append(&MenuItem::with_id(app,"exit","Выход",true,None::<&str>)?)?;
 let mut builder=TrayIconBuilder::with_id("deka-wallpaper").menu(&menu).tooltip("Deka Desktop Wallpaper · режимы и выход").show_menu_on_left_click(true).on_menu_event(|app,event|action(app,event.id.as_ref()));
 if let Some(icon)=app.default_window_icon(){builder=builder.icon(icon.clone());}builder.build(app)?;Ok(())
}
pub fn setup(app:&AppHandle)->Result<(),Box<dyn std::error::Error>>{
 let w=main_window(app)?;let h=hwnd(&w)?;let mut rect=Rect::default();unsafe{GetWindowRect(h,&mut rect);}
 let selected=configuration(app).and_then(|p|std::fs::read_to_string(p).ok()).and_then(|s|serde_json::from_str::<Value>(&s).ok()).and_then(|v|v["selected_monitor"].as_str().map(str::to_owned)).unwrap_or_default();
 app.manage(Wallpaper(Mutex::new(Session{mode:"normal".into(),selected,rect,style:unsafe{GetWindowLongPtrW(h,-16)},ex:unsafe{GetWindowLongPtrW(h,-20)},..Default::default()})));
 install_tray(app)?;
 let app=app.clone();std::thread::spawn(move||{let mut last_shell=find("Shell_TrayWnd");loop{
  std::thread::sleep(Duration::from_millis(1000));let handle=app.clone();let _=app.run_on_main_thread(move||{
   let all=screens(&handle);let geometry=all.iter().map(|m|format!("{}:{},{},{},{}:{}",m.name,m.x,m.y,m.width,m.height,m.scale)).collect::<Vec<_>>().join("|");
   let shell=find("Shell_TrayWnd");if shell!=0&&shell!=last_shell{let _=handle.remove_tray_by_id("deka-wallpaper");let _=install_tray(&handle);} // Re-register after Explorer recreates its tray.
   let st=handle.state::<Wallpaper>();let mut s=st.0.lock().unwrap();let mut recover=false;
   if s.mode!="normal"{
    if !all.iter().any(|m|m.name==s.selected){s.error="Монитор отключён; возвращено обычное окно".into();recover=true;}
    else if s.mode=="background"&&(unsafe{IsWindow(s.shell)}==0||unsafe{IsWindow(s.host)}==0){s.error="Проводник перезапущен; управление восстановлено в окне".into();recover=true;}
    else if s.geometry!=geometry&&!s.geometry.is_empty(){let mode=s.mode.clone();let name=s.selected.clone();s.geometry=geometry.clone();drop(s);let _=place(&handle,&mode,Some(name));return;}
   }
   s.geometry=geometry;
   if recover{if let Ok(w)=main_window(&handle){let _=ordinary(&handle,&w,&mut s);s.recoveries+=1;notify(&handle,&s);}}
   else if let Ok(w)=main_window(&handle){if let Ok(h)=hwnd(&w){let mut front=Rect::default();let mut ours=Rect::default();let fg=unsafe{GetForegroundWindow()};unsafe{GetWindowRect(fg,&mut front);GetWindowRect(h,&mut ours);}
    let covered=fg!=h&&front.left<=ours.left&&front.top<=ours.top&&front.right>=ours.right&&front.bottom>=ours.bottom;
    let quiet=s.mode=="background"||unsafe{IsIconic(h)}!=0||unsafe{IsWindowVisible(h)}==0||covered;
    if s.quiet!=quiet{s.quiet=quiet;notify(&handle,&s);}
   }}
  });last_shell=find("Shell_TrayWnd");
 }});Ok(())
}
#[tauri::command]
pub async fn wallpaper_state(app:AppHandle,window:WebviewWindow)->Result<Value,String>{if window.label()!="main"{return Err("Недоступно".into());}let(tx,rx)=std::sync::mpsc::channel();let h=app.clone();app.run_on_main_thread(move||{let _=tx.send(snapshot(&h));}).map_err(|e|e.to_string())?;rx.recv_timeout(Duration::from_secs(8)).map_err(|e|e.to_string())?}
#[tauri::command]
pub async fn wallpaper_set(app:AppHandle,window:WebviewWindow,mode:String,monitor:Option<String>)->Result<Value,String>{if window.label()!="main"{return Err("Недоступно".into());}let(tx,rx)=std::sync::mpsc::channel();let h=app.clone();app.run_on_main_thread(move||{let _=tx.send(place(&h,&mode,monitor));}).map_err(|e|e.to_string())?;rx.recv_timeout(Duration::from_secs(10)).map_err(|e|e.to_string())?}
#[tauri::command]
pub async fn wallpaper_exit(app:AppHandle,window:WebviewWindow)->Result<(),String>{if window.label()!="main"{return Err("Недоступно".into());}let h=app.clone();app.run_on_main_thread(move||action(&h,"exit")).map_err(|e|e.to_string())}
#[cfg(test)]mod tests{use super::*;#[test]fn negative_and_mixed_dpi_monitor_rects(){let screens=[Screen{name:"A".into(),x:-1920,y:0,width:1920,height:1080,scale:1.},Screen{name:"B".into(),x:0,y:-300,width:2560,height:1440,scale:1.5}];assert!(rect_visible(Rect{left:-1700,top:40,right:-700,bottom:800},&screens));assert!(rect_visible(Rect{left:200,top:-220,right:1400,bottom:600},&screens));assert!(!rect_visible(Rect{left:5000,top:0,right:6000,bottom:800},&screens));assert!(!rect_visible(Rect{left:-1700,top:40,right:-700,bottom:800},&screens[1..]));}}
