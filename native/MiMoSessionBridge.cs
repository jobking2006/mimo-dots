// Product-owned Windows UI adapter. No remote debugging, database access or credentials.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Automation;

class MiMoSessionBridge {
  static JavaScriptSerializer json = new JavaScriptSerializer();
  static IntPtr hwnd;
  static AutomationElement root;
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT point);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h,uint flags);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [StructLayout(LayoutKind.Sequential)] struct POINT {public int x,y;public POINT(int a,int b){x=a;y=b;}}
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }
  [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public KEYBDINPUT k; [FieldOffset(0)] public MOUSEINPUT m; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort vk, scan; public uint flags, time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int x, y; public uint data, flags, time; public UIntPtr extra; }
  static void Emit(object o) { Console.WriteLine(json.Serialize(o)); Console.Out.Flush(); }
  static void Guard() {
    if (GetForegroundWindow() != hwnd) throw new Exception("MiMo 窗口焦点已变化，已停止操作。请回工作台核对后继续。");
    if ((GetAsyncKeyState(27) & 0x8000) != 0) throw new Exception("已按 Esc 停止窗口操作。");
  }
  static AutomationElement ById(string id) { return root.FindFirst(TreeScope.Descendants, new PropertyCondition(AutomationElement.AutomationIdProperty,id)); }
  static AutomationElement Named(string name, ControlType type) {
    var all=root.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.NameProperty,name),new PropertyCondition(AutomationElement.ControlTypeProperty,type)));
    if(all.Count!=1) throw new Exception("MiMo 控件发生变化："+name+"。已停止，未继续点击。");
    return all[0];
  }
  static void Wait(Func<bool> condition) {
    for(int i=0;i<70;i++){ Guard(); if(condition()) return; Thread.Sleep(100); }
    throw new Exception("等待 MiMo 窗口超时；请核对窗口，勿重复创建。");
  }
  static void Invoke(AutomationElement el) {
    Guard(); if(el==null || !el.Current.IsEnabled) throw new Exception("MiMo 控件不可用。");
    object p;
    if(el.TryGetCurrentPattern(InvokePattern.Pattern,out p)) ((InvokePattern)p).Invoke();
    else {
      // Some MiMo custom buttons expose no InvokePattern. Resolve fresh geometry;
      // never retain coordinates, click through another window or scroll blindly.
      var r=el.Current.BoundingRectangle;var bounds=root.Current.BoundingRectangle;
      if(el.Current.IsOffscreen || r.IsEmpty || r.Width<2 || r.Height<2 || !bounds.Contains(r))throw new Exception("MiMo 控件不在可见窗口内，已停止。");
      var point=new POINT((int)(r.Left+r.Width/2),(int)(r.Top+r.Height/2));
      Guard();if(GetAncestor(WindowFromPoint(point),2)!=hwnd)throw new Exception("MiMo 控件被其他窗口遮挡，已停止。");
      if(!SetCursorPos(point.x,point.y))throw new Exception("无法定位 MiMo 控件。");
      Guard();var a=new INPUT[2];a[0].u.m.flags=2;a[1].u.m.flags=4;
      if(SendInput(2,a,Marshal.SizeOf(typeof(INPUT)))!=2)throw new Exception("点击被中断，请核对 MiMo 窗口。");
    }
    Thread.Sleep(180); Guard();
  }
  static string Text(AutomationElement el) {
    if(el==null) throw new Exception("没有找到 MiMo 输入框。");
    object p;
    if(el.TryGetCurrentPattern(ValuePattern.Pattern,out p)) return ((ValuePattern)p).Current.Value;
    if(el.TryGetCurrentPattern(TextPattern.Pattern,out p)) return ((TextPattern)p).DocumentRange.GetText(-1).TrimEnd('\r','\n');
    throw new Exception("无法核对 MiMo 输入框，已停止。");
  }
  static void Key(ushort vk) {
    Guard(); var a=new INPUT[2]; a[0].type=a[1].type=1; a[0].u.k.vk=a[1].u.k.vk=vk; a[1].u.k.flags=2;
    if(SendInput(2,a,Marshal.SizeOf(typeof(INPUT)))!=2) throw new Exception("无法发送按键。");
  }
  static void Type(string text) {
    foreach(char c in text){ Guard(); var a=new INPUT[2]; a[0].type=a[1].type=1; a[0].u.k.scan=a[1].u.k.scan=c; a[0].u.k.flags=4; a[1].u.k.flags=6;
      if(SendInput(2,a,Marshal.SizeOf(typeof(INPUT)))!=2) throw new Exception("输入被中断；请在 MiMo 检查草稿。"); }
  }
  static AutomationElement AccountButton() {
    var bounds=root.Current.BoundingRectangle;
    if(bounds.IsEmpty)throw new Exception("MiMo 窗口不可见，请展开侧边栏后刷新账号。");
    var buttons=root.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Button));
    var found=new List<AutomationElement>();
    foreach(AutomationElement b in buttons) {
      var r=b.Current.BoundingRectangle;var n=b.Current.Name;
      if(!b.Current.IsOffscreen && !r.IsEmpty && n.Length>0 && n.Length<=80 && !n.Contains("\n") && r.Left>=bounds.Left && r.Left<bounds.Left+bounds.Width*0.08 && r.Right<bounds.Left+bounds.Width*0.35 && r.Top>bounds.Bottom-Math.Max(110,bounds.Height*0.13) && r.Bottom<=bounds.Bottom) found.Add(b);
    }
    if(found.Count!=1)throw new Exception("未识别到 MiMo 账号入口，请展开 MiMo 侧边栏后刷新。");
    return found[0];
  }
  static void Account(bool sync) {
    var pop=ById("account-pop");bool opened=false;
    if(pop==null && !sync) {
      var name=AccountButton().Current.Name;
      bool signedOut=name=="登录"||name=="登录 / 注册"||name=="Sign in";
      Emit(new {type="result",name=signedOut?"":name,login=signedOut?"signedOut":"visible",quota="unavailable",source="MiMo 侧边栏"});return;
    }
    if(pop==null) {Invoke(AccountButton());Wait(()=>ById("account-pop")!=null);opened=true;pop=ById("account-pop");}
    try {
      if(sync)Wait(()=>{
        var ready=pop.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.MenuItem));
        foreach(AutomationElement i in ready){var n=Regex.Replace(i.Current.Name,@"\s+"," ").Trim();if(n.EndsWith("已登录")||n=="登录"||n=="Sign in")return true;}
        return false;
      });
      var items=pop.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.MenuItem));
      var names=new List<string>();foreach(AutomationElement i in items)names.Add(Regex.Replace(i.Current.Name,@"\s+"," ").Trim());
      var logged=names.Where(n=>n.EndsWith("已登录")&&n.Length>3).ToArray();
      if(logged.Length==1)Emit(new {type="result",name=logged[0].Substring(0,logged[0].Length-3).Trim(),login="signedIn",quota="unavailable",source="MiMo 账号菜单"});
      else if(names.Any(n=>n=="登录"||n=="Sign in"))Emit(new {type="result",name="",login="signedOut",quota="unavailable",source="MiMo 账号菜单"});
      else throw new Exception("账号菜单内容无法识别，请在 MiMo 查看。没有推测登录状态。");
    } finally {if(opened && GetForegroundWindow()==hwnd)Key(27);}
  }
  [STAThread] static int Main() {
    SetProcessDPIAware();
    Console.InputEncoding=Encoding.UTF8; Console.OutputEncoding=new UTF8Encoding(false);
    try {
      var input=json.Deserialize<Dictionary<string,string>>(Console.ReadLine());
      string op=input["operation"], model=input.ContainsKey("model")?input["model"]:"";
      string exe=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","Xiaomi MiMo","Xiaomi MiMo.exe");
      var windows=Process.GetProcessesByName("Xiaomi MiMo").Where(p=> { try{return p.MainWindowHandle!=IntPtr.Zero && String.Equals(p.MainModule.FileName,exe,StringComparison.OrdinalIgnoreCase);}catch{return false;} }).ToArray();
      if(windows.Length!=1) throw new Exception("请打开一个 MiMo Desktop 主窗口并完成登录。");
      hwnd=windows[0].MainWindowHandle;
      if(op=="account-peek") {
        root=AutomationElement.FromHandle(hwnd);
        if(ById("RootWebArea")==null)throw new Exception("未识别到 MiMo 主界面。");
        Account(false);return 0;
      }
      if(!input.ContainsKey("activate") || input["activate"]!="false") {if(IsIconic(hwnd)) ShowWindow(hwnd,9);SetForegroundWindow(hwnd);}
      Thread.Sleep(300); Guard(); root=AutomationElement.FromHandle(hwnd);
      var doc=ById("RootWebArea"); if(doc==null || doc.Current.Name!="Xiaomi MiMo") throw new Exception("未识别到 MiMo 主界面。");
      if(op=="account-sync") {Account(true);return 0;}
      if(op=="models") {
        var modelButton=ById("model-btn"); if(modelButton==null) throw new Exception("请先在 MiMo 打开一个聊天或新建任务页。");
        var current=modelButton.Current.Name; Invoke(modelButton); Wait(()=>ById("model-menu")!=null);
        var items=ById("model-menu").FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.MenuItem));
        var names=new List<string>(); foreach(AutomationElement item in items) {var n=item.Current.Name; if(!n.Contains("配置")&&!n.Contains("Configure")&&!n.StartsWith("Smart "))names.Add(n);}
        Key(27); Emit(new {type="result",current=current,models=names}); return 0;
      }
      if(op!="create") throw new Exception("不支持的窗口操作。");
      var editor=ById("composer-input");
      if(editor==null || !editor.Current.IsEnabled || !String.IsNullOrWhiteSpace(Text(editor))) throw new Exception("MiMo 当前有未发送的草稿或不在可输入的聊天页。请保存草稿后再创建。");
      // Never navigate away from a running visible turn.
      var stop=root.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Button));
      foreach(AutomationElement b in stop) if(b.Current.IsEnabled && (b.Current.Name.StartsWith("停止")||b.Current.Name.StartsWith("Stop")||b.Current.AutomationId=="stop-btn")) throw new Exception("MiMo 当前会话仍在执行，请等结束后创建。");
      Emit(new {type="progress",detail="正在打开 MiMo 新建任务页"});
      Invoke(Named("新建任务",ControlType.Button));
      Wait(()=>ById("composer-input")!=null && ById("ch-title")==null && ById("proj-chip")!=null);
      if(ById("proj-chip").Current.Name!="进入项目工作")throw new Exception("新任务页选中了项目，请先返回无项目的新任务页再创建。");
      editor=ById("composer-input"); if(!String.IsNullOrWhiteSpace(Text(editor)))throw new Exception("新任务页有未发送草稿，已停止，未覆盖。");
      if(!String.IsNullOrEmpty(model)) {
        Invoke(ById("model-btn")); Wait(()=>ById("model-menu")!=null);
        var menu=ById("model-menu"); var items=menu.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.MenuItem),new PropertyCondition(AutomationElement.NameProperty,model)));
        if(items.Count!=1) {Key(27);throw new Exception("MiMo 中未找到指定模型，请重新读取模型列表。");}
        Invoke(items[0]); Wait(()=>ById("model-menu")==null);
      }
      var chosen=ById("model-btn").Current.Name;
      if(!String.IsNullOrEmpty(model) && model!=chosen && !model.StartsWith(chosen+" "))throw new Exception("模型选择结果不一致，已停止初始化。");
      string message=input["message"];
      if(message.Length>1200 || !message.StartsWith("[工作台建会话 "))throw new Exception("无效的初始化内容。");
      Guard(); editor=ById("composer-input"); editor.SetFocus(); Thread.Sleep(100); Guard();
      if(!editor.Current.HasKeyboardFocus || !String.IsNullOrWhiteSpace(Text(editor))) throw new Exception("输入框焦点或草稿发生变化，已停止。");
      if((GetAsyncKeyState(16)&0x8000)!=0 || (GetAsyncKeyState(17)&0x8000)!=0 || (GetAsyncKeyState(18)&0x8000)!=0)throw new Exception("检测到修饰键按下，请松开键盘后重试。");
      Type(message); Thread.Sleep(200); Guard();
      if(Text(ById("composer-input")).Trim()!=message.Trim()) throw new Exception("输入内容核对失败，已保留草稿，未发送。");
      // Only the verified new-task page can send this one harmless initialization.
      if(ById("ch-title")!=null || ById("proj-chip")==null) throw new Exception("页面发生变化，未发送初始化。");
      Emit(new {type="progress",detail="正在发送一次初始化，随后核对新会话"});
      Invoke(ById("send-btn"));
      Emit(new {type="result",model=chosen,submitted=true}); return 0;
    } catch(Exception e) {Emit(new {type="error",message=e.Message});return 1;}
  }
}
