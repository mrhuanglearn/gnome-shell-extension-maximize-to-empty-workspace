/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import Meta from 'gi://Meta';
import Gio from 'gi://Gio';
import {Extension as ShellExtension} from 'resource:///org/gnome/shell/extensions/extension.js';
//  _mutterSettings.get_boolean('workspaces-only-on-primary');
//  _mutterSettings.get_boolean('dynamic-workspaces');

export default class Extension extends ShellExtension {
 
    constructor(metadata) {
        super(metadata);

        this._handles = [];
        this._windowids_maximized = new Map();
        this._windowids_size_change = new Map();
    }

    _getMetaWindow(act) {
        return act?.meta_window ?? act ?? null;
    }

    _getWindowId(win) {
        if (!win)
            return null;

        if (typeof win.get_id === 'function')
            return win.get_id();

        if (typeof win.get_stable_sequence === 'function')
            return win.get_stable_sequence();

        return null;
    }

    _setWindowState(map, win, value) {
        const id = this._getWindowId(win);

        if (id !== null)
            map.set(id, value);
    }

    _hasWindowState(map, win) {
        const id = this._getWindowId(win);

        return id !== null && map.has(id);
    }

    _getWindowState(map, win) {
        const id = this._getWindowId(win);

        return id !== null ? map.get(id) : undefined;
    }

    _takeWindowState(map, win) {
        const id = this._getWindowId(win);

        if (id !== null)
            map.delete(id);
    }

    _isNormalWindow(win) {
        if (!win)
            return false;

        const windowType = typeof win.get_window_type === 'function'
            ? win.get_window_type()
            : win.window_type;

        return windowType === Meta.WindowType.NORMAL;
    }

    _isFullyMaximized(win) {
        if (!win)
            return false;

        if (typeof win.is_maximized === 'function')
            return win.is_maximized();

        const flags = win.get_maximized();
        const both = Meta.MaximizeFlags.BOTH ??
            (Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);

        return (flags & both) === both;
    }

    _rectEqual(a, b) {
        if (!a || !b)
            return false;

        if (typeof a.equal === 'function')
            return a.equal(b);

        return a.x === b.x && a.y === b.y &&
            a.width === b.width && a.height === b.height;
    }
    
    // First free workspace on the specified monitor
    getFirstFreeMonitor(manager,mMonitor) {
        const n = manager.get_n_workspaces();
        for (let i = 0; i < n; i++) 
        {
            let win_count = manager.get_workspace_by_index(i).list_windows().filter(w => !w.is_always_on_all_workspaces() && w.get_monitor()==mMonitor).length;
            if (win_count < 1) 
                return i; 
        }
        return -1;
    }
    
    // last occupied workspace on the specified monitor
    getLastOcupiedMonitor(manager,nCurrent,mMonitor) {
        for (let i = nCurrent-1; i >= 0; i--) 
        {
            let win_count = manager.get_workspace_by_index(i).list_windows().filter(w => !w.is_always_on_all_workspaces() && w.get_monitor()==mMonitor).length;
            if (win_count > 0) 
                return i;
        }
        const n = manager.get_n_workspaces();
        for (let i = nCurrent + 1; i < n; i++) 
        {
            let win_count = manager.get_workspace_by_index(i).list_windows().filter(w => !w.is_always_on_all_workspaces() && w.get_monitor()==mMonitor).length;
            if (win_count > 0) 
                return i; 
        }
        return -1;
    }
    
    placeOnWorkspace(win) {
        //console.log("achim","placeOnWorkspace:"+win.get_id());
        // bMap true - new windows to end of workspaces
        const bMap = false;

        // Idea: don't move the coresponding window to an other workspace (it may be not fully active yet)
        // Reorder the workspaces and move all other window

        const workspace = win.get_workspace();
        const display = win.get_display();
        if (!workspace || !display)
            return;

        const mMonitor=win.get_monitor();
        const wList = workspace.list_windows().filter(w => w!==win && !w.is_always_on_all_workspaces() && w.get_monitor()==mMonitor);
        if (wList.length >= 1) 
            {
            const manager = display.get_workspace_manager();
            const current = manager.get_active_workspace_index();
            if (this._mutterSettings.get_boolean('workspaces-only-on-primary'))
                {
                const mPrimary=display.get_primary_monitor();
                // Only primary monitor is relevant, others don't have multiple workspaces
                if (mMonitor!=mPrimary) 
                    return;
                const firstfree=this.getFirstFreeMonitor(manager,mMonitor);
                // No free monitor: do nothing
                if (firstfree==-1)
                    return;
                if (current<firstfree)
                    {
                    if (bMap)
                        {
                        // show new window on next free monitor (last on dynamic workspaces)
                        manager.reorder_workspace(manager.get_workspace_by_index(firstfree),current);
                        manager.reorder_workspace(manager.get_workspace_by_index(current+1),firstfree);
                        // move the other windows to their old places
                        wList.forEach( w => {w.change_workspace_by_index(current, false);});
                        }
                    else
                        {
                        // alternative, works too
                        //win.change_workspace_by_index(firstfree, false);
                        //manager.reorder_workspace(manager.get_workspace_by_index(firstfree),current+1);
                        //manager.get_workspace_by_index(current+1).activate(global.get_current_time());
                        
                        // insert existing window on next monitor (each other workspace is moved one index further)
                        manager.reorder_workspace(manager.get_workspace_by_index(firstfree),current);
                        // move the other windows to their old places
                        wList.forEach( w => {w.change_workspace_by_index(current, false);});
                        }
                    // remember reordered window
                    this._setWindowState(this._windowids_maximized, win, "reorder");
                    }
                else if (current>firstfree)
                    {
                    // show window on next free monitor (doesn't happen with dynamic workspaces)
                    manager.reorder_workspace(manager.get_workspace_by_index(current),firstfree);
                    manager.reorder_workspace(manager.get_workspace_by_index(firstfree+1),current);
                    // move the other windows to their old places
                    wList.forEach( w => {w.change_workspace_by_index(current, false);});
                    // remember reordered window
                    this._setWindowState(this._windowids_maximized, win, "reorder");
                    }
                }
            else
                {
                // All monitors have workspaces
                // search the workspaces for a free monitor on the same index
                const firstfree=this.getFirstFreeMonitor(manager,mMonitor);
                // No free monitor: do nothing
                if (firstfree==-1)
                    return;
                // show the window on the workspace with the empty monitor
                const wListcurrent = workspace.list_windows().filter(w => w!==win && !w.is_always_on_all_workspaces());
                const wListfirstfree = manager.get_workspace_by_index(firstfree).list_windows().filter(w => w!==win && !w.is_always_on_all_workspaces());
                if (current<firstfree)
                    {
                    manager.reorder_workspace(manager.get_workspace_by_index(firstfree),current);
                    manager.reorder_workspace(manager.get_workspace_by_index(current+1),firstfree);
                    // move the other windows to their old places
                    wListcurrent.forEach( w => {w.change_workspace_by_index(current, false);});
                    wListfirstfree.forEach( w => {w.change_workspace_by_index(firstfree, false);});
                    // remember reordered window
                    this._setWindowState(this._windowids_maximized, win, "reorder");
                    }
                else if (current>firstfree)
                    {
                    manager.reorder_workspace(manager.get_workspace_by_index(current),firstfree);
                    manager.reorder_workspace(manager.get_workspace_by_index(firstfree+1),current);
                    // move the other windows to their old places
                    wListcurrent.forEach( w => {w.change_workspace_by_index(current, false);});
                    wListfirstfree.forEach( w => {w.change_workspace_by_index(firstfree, false);});
                    // remember reordered window
                    this._setWindowState(this._windowids_maximized, win, "reorder");
                    }
                }
            }
    }

    // back to last workspace
    backto(win) {

        //console.log("achim","backto "+win.get_id());
        
        // Idea: don't move the coresponding window to an other workspace (it may be not fully active yet)
        // Reorder the workspaces and move all other window
        
        if (!this._hasWindowState(this._windowids_maximized, win))
            {
            // no new screen is used in the past: do nothing
            return;
            }
        
        // this is not longer maximized
        this._takeWindowState(this._windowids_maximized, win);

        const workspace = win.get_workspace();
        const display = win.get_display();
        if (!workspace || !display)
            return;

        const mMonitor=win.get_monitor();
        const wList = workspace.list_windows().filter(w => w!==win && !w.is_always_on_all_workspaces() && w.get_monitor()==mMonitor);
        if (wList.length == 0) 
            {
            const manager = display.get_workspace_manager();
            const current = manager.get_active_workspace_index();
            if (this._mutterSettings.get_boolean('workspaces-only-on-primary'))
                {
                const mPrimary=display.get_primary_monitor();
                // Only primary monitor is relevant, others don't have multiple workspaces
                if (mMonitor!=mPrimary) 
                    return;
                const lastocupied=this.getLastOcupiedMonitor(manager,current,mMonitor);
                // No occupied monitor: do nothing
                //log("lastocupied "+ lastocupied);
                if (lastocupied==-1)
                    return;
                const wListlastoccupied = manager.get_workspace_by_index(lastocupied).list_windows().filter(w => w!==win && !w.is_always_on_all_workspaces() && w.get_monitor()==mMonitor);
                // switch workspace position to last with windows and move all windows there
                manager.reorder_workspace(manager.get_workspace_by_index(current),lastocupied);
                wListlastoccupied.forEach( w => {w.change_workspace_by_index(lastocupied, false);});
                }
            else
                {
                const lastocupied=this.getLastOcupiedMonitor(manager,current,mMonitor);
                // No occupied monitor: do nothing
                if (lastocupied==-1)
                    return;
                const wListcurrent = workspace.list_windows().filter(w => w!==win && !w.is_always_on_all_workspaces());
                if (wListcurrent.length > 0) 
                    return;
                const wListlastoccupied = manager.get_workspace_by_index(lastocupied).list_windows().filter(w => w!==win && !w.is_always_on_all_workspaces());
                // switch workspace position to last with windows and move all windows there
                manager.reorder_workspace(manager.get_workspace_by_index(current),lastocupied);
                wListlastoccupied.forEach( w => {w.change_workspace_by_index(lastocupied, false);});
                }
            }
    }
    
    window_manager_map(act)
    {
        const win = this._getMetaWindow(act);
        //console.log("achim","window_manager_map "+win.get_id());
        if (!this._isNormalWindow(win))
            return;
        if (!this._isFullyMaximized(win))
            return;
        if (win.is_always_on_all_workspaces())
            return;
        this.placeOnWorkspace(win);
    }
    
    window_manager_destroy(act)
    {
        const win = this._getMetaWindow(act);
        //console.log("achim","window_manager_destroy");
        if (!this._isNormalWindow(win))
            return;
        this.backto(win);
    }

    window_manager_size_change(act,change,rectold) 
    {
        const win = this._getMetaWindow(act);
        //console.log("achim","window_manager_size_change "+win.get_id());
        if (!this._isNormalWindow(win))
            return;
        if (win.is_always_on_all_workspaces())
            return;
        if (change === Meta.SizeChange.MAXIMIZE)
            {
            //console.log("achim","Meta.SizeChange.MAXIMIZE");
            if (this._isFullyMaximized(win))
                {
                //console.log("achim","=== Meta.MaximizeFlags.BOTH");
                this._setWindowState(this._windowids_size_change, win, "place");
                }
            }
        else if (change  === Meta.SizeChange.FULLSCREEN)
            {
            //console.log("achim","Meta.SizeChange.FULLSCREEN");
                this._setWindowState(this._windowids_size_change, win, "place");
            }
        else if (change === Meta.SizeChange.UNMAXIMIZE)
            {
            //console.log("achim","Meta.SizeChange.UNMAXIMIZE");
            // do nothing if it was only partially maximized
            const rectmax=win.get_work_area_for_monitor(win.get_monitor());     
            if (this._rectEqual(rectmax, rectold))
                {
                //console.log("achim","rectmax matches");
                this._setWindowState(this._windowids_size_change, win, "back");
                }
            }
        else if (change === Meta.SizeChange.UNFULLSCREEN)
            {
            //console.log("achim","change === Meta.SizeChange.UNFULLSCREEN");
            if (!this._isFullyMaximized(win))
                {
                //console.log("achim","!== Meta.MaximizeFlags.BOTH");
                this._setWindowState(this._windowids_size_change, win, "back");
                }
            }
    }

    window_manager_minimize(act)
    {
        const win = this._getMetaWindow(act);
        //console.log("achim","window_manager_minimize");
        if (!this._isNormalWindow(win))
            return;
        if (win.is_always_on_all_workspaces())
            return;
        this.backto(win);
    }

    window_manager_unminimize(act)
    {
        const win = this._getMetaWindow(act);
        //console.log("achim","window_manager_umminimize");
        if (!this._isNormalWindow(win))
            return;
        if (!this._isFullyMaximized(win))
            return;
        if (win.is_always_on_all_workspaces())
            return;
        this.placeOnWorkspace(win);
    }
    
    window_manager_size_changed(act)
    {
        const win = this._getMetaWindow(act);
        //console.log("achim","window_manager_size_changed "+win.get_id());
        const state = this._getWindowState(this._windowids_size_change, win);
        if (state !== undefined) {
            if (state=="place") {                
                this.placeOnWorkspace(win);
            } else if (state=="back") {                
                this.backto(win);
            }
            this._takeWindowState(this._windowids_size_change, win);
        }
    }

    window_manager_switch_workspace()
    {
        // console.log("achim","window_manager_switch_workspace");
    }

    enable() {
        if (this._handles.length > 0)
            return;

        this._mutterSettings = new Gio.Settings({ schema_id: 'org.gnome.mutter' });
        // Trigger new window with maximize size and if the window is maximized
        this._handles.push(global.window_manager.connect('minimize', (_, act) => {this.window_manager_minimize(act);}));
        this._handles.push(global.window_manager.connect('unminimize', (_, act) => {this.window_manager_unminimize(act);}));
        this._handles.push(global.window_manager.connect('size-changed', (_, act) => {this.window_manager_size_changed(act);}));
        this._handles.push(global.window_manager.connect('switch-workspace', (_) => {this.window_manager_switch_workspace();}));
        this._handles.push(global.window_manager.connect('map', (_, act) => {this.window_manager_map(act);}));
        this._handles.push(global.window_manager.connect('destroy', (_, act) => {this.window_manager_destroy(act);}));
        this._handles.push(global.window_manager.connect('size-change', (_, act, change,rectold) => {this.window_manager_size_change(act,change,rectold);}));
    }

    disable() {
        // remove array and disconect
        this._handles.splice(0).forEach(h => global.window_manager.disconnect(h));
        this._windowids_maximized.clear();
        this._windowids_size_change.clear();
        
        this._mutterSettings = null;
    }
}