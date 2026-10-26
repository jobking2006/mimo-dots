// Product-owned macOS Accessibility adapter. No vendor code, databases or credentials.
import AppKit
import ApplicationServices

struct BridgeError: Error { let message: String; init(_ message:String){self.message=message} }
func emit(_ value:[String:Any]) { if let data=try? JSONSerialization.data(withJSONObject:value),let text=String(data:data,encoding:.utf8){print(text);fflush(stdout)} }
func attr(_ e:AXUIElement,_ key:String)->AnyObject? { var v:CFTypeRef?; guard AXUIElementCopyAttributeValue(e,key as CFString,&v) == .success else{return nil};return v }
func text(_ e:AXUIElement,_ key:String)->String {attr(e,key) as? String ?? ""}
func children(_ e:AXUIElement)->[AXUIElement] {attr(e,kAXChildrenAttribute) as? [AXUIElement] ?? []}
func descendants(_ e:AXUIElement,_ depth:Int=0)->[AXUIElement] {if depth>22{return []};return [e]+children(e).flatMap{descendants($0,depth+1)}}
func label(_ e:AXUIElement)->String { for key in [kAXTitleAttribute,kAXDescriptionAttribute,kAXValueAttribute] {let v=text(e,key);if !v.isEmpty{return v}};return "" }
func domID(_ e:AXUIElement)->String {let id=text(e,"AXDOMIdentifier");return id.isEmpty ? text(e,kAXIdentifierAttribute):id}
func draft(_ e:AXUIElement)throws->String {
 guard let value=attr(e,kAXValueAttribute) as? String else {throw BridgeError("无法读取 MiMo 草稿，已停止且未覆盖。")};return value
}

final class Bridge {
 let app:NSRunningApplication
 let root:AXUIElement
 var window:AXUIElement
 init() throws {
   guard AXIsProcessTrusted() else {throw BridgeError("需要辅助功能权限：系统设置 → 隐私与安全性 → 辅助功能，允许 MiMo Dots（开发时允许启动它的终端），然后重新打开工作台。")}
   let apps=NSRunningApplication.runningApplications(withBundleIdentifier:"com.xiaomi.mimo.desktop").filter{$0.activationPolicy == .regular}
   guard apps.count == 1,let running=apps.first else {throw BridgeError("请打开一个 Xiaomi MiMo Desktop 主窗口并完成登录。")}
   app=running;root=AXUIElementCreateApplication(running.processIdentifier)
   AXUIElementSetMessagingTimeout(root,2)
   let windows=attr(root,kAXWindowsAttribute) as? [AXUIElement] ?? []
   let matches=windows.filter{label($0)=="Xiaomi MiMo"}
   guard matches.count == 1 else {throw BridgeError("请保留一个可见的 MiMo 主窗口。")};window=matches[0]
 }
 func nodes()->[AXUIElement] {descendants(window)}
 func find(_ id:String)->AXUIElement? {let all=nodes().filter{domID($0)==id};return all.count == 1 ? all[0]:nil}
 func require(_ id:String)throws->AXUIElement {guard let e=find(id) else{throw BridgeError("MiMo 控件发生变化：\(id)。已停止，请核对已有会话，勿重复创建。")};return e}
 func guardFocus()throws {
   guard NSWorkspace.shared.frontmostApplication?.processIdentifier==app.processIdentifier else {throw BridgeError("MiMo 窗口焦点已变化，已停止。请回工作台核对已有会话。")}
   if CGEventSource.keyState(.combinedSessionState,key:53){throw BridgeError("已按 Esc 停止窗口操作，请核对已有会话。")}
 }
 func activate()throws {app.activate(options:[.activateAllWindows]);Thread.sleep(forTimeInterval:0.3);try guardFocus()}
 func press(_ e:AXUIElement)throws {try guardFocus();guard attr(e,kAXEnabledAttribute) as? Bool != false else {throw BridgeError("MiMo 控件不可用。")};guard AXUIElementPerformAction(e,kAXPressAction as CFString) == .success else {throw BridgeError("MiMo 控件无法点击，已停止。")};Thread.sleep(forTimeInterval:0.18);try guardFocus()}
 func wait(_ condition:()->Bool)throws {for _ in 0..<65 {try guardFocus();if condition(){return};Thread.sleep(forTimeInterval:0.1)};throw BridgeError("等待 MiMo 窗口超时，请核对已有会话，勿重复创建。")}
 func key(_ code:CGKeyCode)throws {try guardFocus();let source=CGEventSource(stateID:.privateState);for down in [true,false]{guard let event=CGEvent(keyboardEventSource:source,virtualKey:code,keyDown:down) else {throw BridgeError("无法发送按键。")};event.postToPid(app.processIdentifier)};Thread.sleep(forTimeInterval:0.2);try guardFocus()}
 func menuItems(_ menu:AXUIElement)->[AXUIElement] {descendants(menu).filter{text($0,kAXRoleAttribute)==kAXMenuItemRole}}
 func accountButton()throws->AXUIElement {
   // The only named popup immediately inside the sidebar account row (bottom 15%).
   var windowPoint=CGPoint.zero,windowSize=CGSize.zero
   if let v=attr(window,kAXPositionAttribute){AXValueGetValue(v as! AXValue,.cgPoint,&windowPoint)}
   if let v=attr(window,kAXSizeAttribute){AXValueGetValue(v as! AXValue,.cgSize,&windowSize)}
   let candidates=nodes().filter{ e in
     guard text(e,kAXRoleAttribute)==kAXPopUpButtonRole,!label(e).isEmpty,!["更新","Update"].contains(label(e)),label(e).count<=80,let pv=attr(e,kAXPositionAttribute),let sv=attr(e,kAXSizeAttribute) else{return false}
     var p=CGPoint.zero,s=CGSize.zero;AXValueGetValue(pv as! AXValue,.cgPoint,&p);AXValueGetValue(sv as! AXValue,.cgSize,&s)
     return p.x>=windowPoint.x && p.x<windowPoint.x+windowSize.width*0.08 && p.x+s.width<windowPoint.x+windowSize.width*0.35 && p.y>windowPoint.y+windowSize.height-max(110,windowSize.height*0.15) && p.y+s.height<=windowPoint.y+windowSize.height
   }
   guard candidates.count==1 else {throw BridgeError("未识别 MiMo 账号入口，请展开 MiMo 侧边栏后刷新。")};return candidates[0]
 }
 func account(_ sync:Bool)throws {
   if !sync,find("account-pop")==nil {
     let name=label(try accountButton()),signedOut=["登录","登录 / 注册","Sign in"].contains(name)
     emit(["type":"result","name":signedOut ? "":name,"login":signedOut ? "signedOut":"visible","source":"MiMo 侧边栏"]);return
   }
   var opened=false
   if find("account-pop")==nil {try press(accountButton());opened=true;try wait{self.find("account-pop") != nil}}
   defer {if opened {try? key(53);try? wait{self.find("account-pop")==nil}}}
   let menu=try require("account-pop")
   let names=menuItems(menu).map{label($0).replacingOccurrences(of:"\\s+",with:" ",options:.regularExpression).trimmingCharacters(in:.whitespacesAndNewlines)}
   let logged=names.filter{$0.hasSuffix("已登录") && $0.count>3}
   if logged.count==1 {emit(["type":"result","name":String(logged[0].dropLast(3)).trimmingCharacters(in:.whitespaces),"login":"signedIn","source":"MiMo 账号菜单"])}
   else if names.contains("登录")||names.contains("Sign in") {emit(["type":"result","name":"","login":"signedOut","source":"MiMo 账号菜单"])}
   else {throw BridgeError("账号菜单无法识别，未推测登录状态。请在 MiMo 查看。")}
 }
 func modelMenu()throws->AXUIElement {try press(require("model-btn"));try wait{self.find("model-menu") != nil};return try require("model-menu")}
 func run(_ input:[String:String])throws {
   let op=input["operation"] ?? ""
   if op=="account-peek" {try account(false);return}
   if input["activate"] != "false" {try activate()} else {try guardFocus()}
   if op=="account-sync" {try account(true);return}
   if op=="models" {
     let current=label(try require("model-btn")),menu=try modelMenu()
     let names=menuItems(menu).map{label($0)}.filter{!$0.isEmpty && !$0.contains("配置") && !$0.contains("Configure") && !$0.hasPrefix("Smart ")}
     try key(53);try wait{self.find("model-menu")==nil};guard !names.isEmpty else {throw BridgeError("MiMo 没有暴露可选模型。")};emit(["type":"result","current":current,"models":names]);return
   }
   guard op=="create" else {throw BridgeError("不支持的窗口操作。")}
   let message=input["message"] ?? "",model=input["model"] ?? ""
   guard message.hasPrefix("[工作台建会话 "),message.count<=1200 else {throw BridgeError("无效初始化内容。")}
   let editor=try require("composer-input")
   guard try draft(editor).isEmpty else {throw BridgeError("MiMo 有未发送草稿，请先保存草稿；没有覆盖或发送。")}
   guard !nodes().contains(where:{text($0,kAXRoleAttribute)==kAXButtonRole && (label($0).hasPrefix("停止") || label($0).hasPrefix("Stop") || domID($0)=="stop-btn") && attr($0,kAXEnabledAttribute) as? Bool != false}) else {throw BridgeError("MiMo 当前任务仍在执行，请等结束再创建。")}
   let newButtons=nodes().filter{text($0,kAXRoleAttribute)==kAXButtonRole && label($0)=="新建任务"}
   guard newButtons.count==1 else {throw BridgeError("未识别唯一的新建任务按钮。")}
   emit(["type":"progress","detail":"正在打开 MiMo 新建任务页"]);try press(newButtons[0])
   try wait{self.find("composer-input") != nil && self.find("ch-title")==nil && self.find("proj-chip") != nil}
   guard label(try require("proj-chip"))=="进入项目工作" else {throw BridgeError("新任务页带有项目上下文，请先返回无项目的新任务页。")}
   guard try draft(require("composer-input")).isEmpty else {throw BridgeError("新任务页有草稿，未覆盖。")}
   if !model.isEmpty {
     let menu=try modelMenu(),matches=menuItems(menu).filter{label($0)==model}
     guard matches.count==1 else {try? key(53);throw BridgeError("指定模型已变化，请重新读取模型。")}
     try press(matches[0]);try wait{self.find("model-menu")==nil}
   }
   let chosen=label(try require("model-btn"))
   // Verified installed catalog/UI labels for the two built-in MiMo models.
   let knownModels=["MiMo V2.6 Flash":"mimo-v2.6-flash","MiMo V2.6 Pro":"mimo-v2.6-pro","MiMo-V2.6-Flash":"mimo-v2.6-flash","MiMo-V2.6-Pro":"mimo-v2.6-pro"]
   let modelID=knownModels[chosen] ?? chosen
   guard modelID.range(of:"^[A-Za-z0-9._-]+$",options:.regularExpression) != nil else {throw BridgeError("模型名称格式已变化，无法安全核对模型；请手动创建并绑定。") }
   guard model.isEmpty || model==chosen || model.hasPrefix(chosen+" ") else {throw BridgeError("模型选择结果不一致，未发送初始化。")}
   guard input["checkpoint"]=="true" else {throw BridgeError("缺少工作台模型记录握手，未提交初始化。")}
   emit(["type":"selection","modelID":modelID])
   guard let ackLine=readLine(),let ackData=ackLine.data(using:.utf8),let ack=try JSONSerialization.jsonObject(with:ackData) as? [String:String],ack["operation"]=="verified-selection",ack["modelID"]==modelID else {throw BridgeError("模型记录未确认，未提交初始化。")}
   let target=try require("composer-input")
   guard try draft(target).isEmpty,label(try require("model-btn"))==chosen,label(try require("proj-chip"))=="进入项目工作",find("ch-title")==nil else {throw BridgeError("草稿、模型或项目上下文发生变化，未覆盖或提交。")}

   try guardFocus()
   guard AXUIElementSetAttributeValue(target,kAXFocusedAttribute as CFString,kCFBooleanTrue) == .success else {throw BridgeError("无法聚焦 MiMo 输入框。")}
   guard try draft(target).isEmpty else {throw BridgeError("MiMo 草稿已变化，未覆盖。") }
   guard AXUIElementSetAttributeValue(target,kAXValueAttribute as CFString,message as CFString) == .success else {throw BridgeError("MiMo 输入框不可写。")}
   Thread.sleep(forTimeInterval:0.2);try guardFocus()
   guard try draft(require("composer-input"))==message,find("ch-title")==nil,label(try require("proj-chip"))=="进入项目工作",label(try require("model-btn"))==chosen else {throw BridgeError("输入或页面核对失败，保留草稿且未发送。")}
   emit(["type":"progress","detail":"正在提交一次初始化，随后核对新会话"])
   try press(require("send-btn"));emit(["type":"result","model":chosen,"modelID":modelID,"submitted":true])
 }
}

do {
 guard let line=readLine(),let data=line.data(using:.utf8),let input=try JSONSerialization.jsonObject(with:data) as? [String:String] else {throw BridgeError("无效窗口助手输入。")}
 try Bridge().run(input)
} catch {emit(["type":"error","message":(error as? BridgeError)?.message ?? "窗口助手未完成，请核对 MiMo 已有会话。"]);exit(1)}
