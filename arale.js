var arale=(function () {


    var Class = (function () {
        function Class(o) {
            // Convert existed function to Class.
            if (!(this instanceof Class) && isFunction(o)) {
                return classify(o);
            }
        }

        // Create a new Class.
        //
        //  var SuperPig = Class.create({
        //    Extends: Animal,
        //    Implements: Flyable,
        //    initialize: function() {
        //      SuperPig.superclass.initialize.apply(this, arguments)
        //    },
        //    Statics: {
        //      COLOR: 'red'
        //    }
        // })
        //
        //应该改一下第一个参数的作用 --> 构造函数

        Class.create = function (_constructor, properties) {

            if (!isFunction(_constructor)) {
                properties = _constructor;
            } else { //将第一个参数改为构造函数
                properties.initialize = _constructor;
            }

            properties || (properties = {});

            var parent = properties.Extends || Class;

            properties.Extends = parent;

            // The created class constructor////??????
            function SubClass() {
                // Call the parent constructor.
                parent.apply(this, arguments); //貌似删掉也没差别

                // Only call initialize in self constructor.
                //执行自己的初始化函数，父类的初始化函数都不执行,
                if (this.constructor === SubClass && this.initialize) {
                    this.initialize.apply(this, arguments);
                }
            }

            // Inherit class (static) properties from parent.
            if (parent !== Class) {
                mix(SubClass, parent, parent.StaticsWhiteList);
            }

            // Add instance properties to the subclass.
            implement.call(SubClass, properties);

            // Make subclass extendable.
            return classify(SubClass);
        }

        function implement(properties) {
            var key,
                value

            for (key in properties) {
                value = properties[key]
                // 遍历传入参数，特殊参数特殊处理，其他归入原型
                if (Class.Mutators.hasOwnProperty(key)) {
                    Class.Mutators[key].call(this, value);
                } else {
                    this.prototype[key] = value;
                }
            }
        }

        // Create a sub Class based on `Class`.
        Class.extend = function (properties) {
            properties || (properties = {});
            properties.Extends = this;
            return Class.create(properties);
        }

        function classify(cls) {
            cls.extend = Class.extend;
            cls.implement = implement;
            return cls;
        }

        // Mutators define special properties.
        Class.Mutators = {

            'Extends': function (parent) {
                var existed = this.prototype;
                var proto = createProto(parent.prototype);

                // Keep existed properties.
                mix(proto, existed);

                // Enforce the constructor to be what we expect.
                proto.constructor = this;

                // Set the prototype chain to inherit from `parent`.
                this.prototype = proto;

                // Set a convenience property in case the parent's prototype is
                // needed later.
                this.superclass = parent.prototype;
            },

            'Implements': function (items) {
                isArray(items) || (items = [items])
                var proto = this.prototype, item;
                while (item = items.shift()) {
                    mix(proto, item.prototype || item)
                }
            },

            'Statics': function (staticProperties) {
                mix(this, staticProperties)
            }
        }

        // Shared empty constructor function to aid in prototype-chain creation.
        function Ctor() {
        }

        // See: http://jsperf.com/object-create-vs-new-ctor
        //如果__proto__可访问，则会创造__proto__属性，指向父类的prototype，
        var createProto = Object.__proto__ ?
            function (proto) {
                return {
                    __proto__: proto
                };
            } : function (proto) {
            Ctor.prototype = proto;
            return new Ctor();
        };

        // Helpers
        // ------------

        function mix(r, s, wl) {
            // Copy "all" properties including inherited ones.
            for (var p in s) {
                if (s.hasOwnProperty(p)) {
                    if (wl && indexOf(wl, p) === -1)
                        continue;
                    // 在 iPhone 1 代等设备的 Safari 中，prototype 也会被枚举出来，需排除
                    if (p !== 'prototype') {
                        r[p] = s[p];
                    }
                }
            }
        }

        var toString = Object.prototype.toString;

        var isArray = Array.isArray || function (val) {
                return toString.call(val) === '[object Array]';
            };

        var isFunction = function (val) {
            return toString.call(val) === '[object Function]';
        };

        var indexOf = Array.prototype.indexOf ?
            function (arr, item) {
                return arr.indexOf(item)
            }
            :
            function (arr, item) {
                for (var i = 0, len = arr.length; i < len; i++) {
                    if (arr[i] === item) {
                        return i
                    }
                }
                return -1
            };

        return Class;

    })();
    var Aspect = (function () {

        var aspect = {};

        aspect.before = function (methodName, callback, context) {
            return weave.call(this, 'before', methodName, callback, context);
        };


        // 在指定方法执行后，再执行 callback
        aspect.after = function (methodName, callback, context) {
            return weave.call(this, 'after', methodName, callback, context);
        };


        // Helpers
        // -------

        var eventSplitter = /\s+/;

        function weave(when, methodName, callback, context) {
            var names = methodName.split(eventSplitter);
            var name, method;

            while (name = names.shift()) {
                method = getMethod(this, name);
                if (!method.__isAspected) {
                    wrap.call(this, name);
                }
                this.on(when + ':' + name, callback, context);
            }

            return this;
        }


        function getMethod(host, methodName) {
            var method = host[methodName];
            if (!method) {
                throw new Error('Invalid method name: ' + methodName);
            }
            return method;
        }


        function wrap(methodName) {
            var old = this[methodName];

            this[methodName] = function () {
                var args = Array.prototype.slice.call(arguments);
                var beforeArgs = ['before:' + methodName].concat(args);

                // prevent if trigger return false
                if (this.trigger.apply(this, beforeArgs) === false) return;

                var ret = old.apply(this, arguments);
                var afterArgs = ['after:' + methodName, ret].concat(args);
                this.trigger.apply(this, afterArgs);

                return ret;
            };

            this[methodName].__isAspected = true;
        }


        return aspect;


    })()


    var Attribute = (function () {
        var attribute = {};
        attribute.initAttrs = function (config) {
            // initAttrs 是在初始化时调用的，默认情况下实例上肯定没有 attrs，不存在覆盖问题
            var attrs = this.attrs = {};

            // Get all inherited attributes.
            var specialProps = this.propsInAttrs || [];
            mergeInheritedAttrs(attrs, this, specialProps);

            // Merge user-specific attributes from config.
            if (config) {
                mergeUserValue(attrs, config);
            }

            // 对于有 setter 的属性，要用初始值 set 一下，以保证关联属性也一同初始化
            setSetterAttrs(this, attrs, config);

            // Convert `on/before/afterXxx` config to event handler.
            parseEventsFromAttrs(this, attrs);

            // 将 this.attrs 上的 special properties 放回 this 上
            copySpecialProps(specialProps, this, attrs, true);
        };


        // Get the value of an attribute.
        attribute.get = function (key) {
            var attr = this.attrs[key] || {};
            var val = attr.value;
            return attr.getter ? attr.getter.call(this, val, key) : val;
        };


        // Set a hash of model attributes on the object, firing `"change"` unless
        // you choose to silence it.
        attribute.set = function (key, val, options) {
            var attrs = {};

            // set("key", val, options)
            if (isString(key)) {
                attrs[key] = val;
            }
            // set({ "key": val, "key2": val2 }, options)
            else {
                attrs = key;
                options = val;
            }

            options || (options = {});
            var silent = options.silent;
            var override = options.override;

            var now = this.attrs;
            var changed = this.__changedAttrs || (this.__changedAttrs = {});

            for (key in attrs) {
                if (!attrs.hasOwnProperty(key)) continue;

                var attr = now[key] || (now[key] = {});
                val = attrs[key];

                if (attr.readOnly) {
                    throw new Error('This attribute is readOnly: ' + key);
                }

                // invoke setter
                if (attr.setter) {
                    val = attr.setter.call(attribute, val, key);
                }

                // 获取设置前的 prev 值
                var prev = this.get(key);

                // 获取需要设置的 val 值
                // 如果设置了 override 为 true，表示要强制覆盖，就不去 merge 了
                // 都为对象时，做 merge 操作，以保留 prev 上没有覆盖的值
                if (!override && isPlainObject(prev) && isPlainObject(val)) {
                    val = merge(merge({}, prev), val);
                }

                // set finally
                now[key].value = val;

                // invoke change event
                // 初始化时对 set 的调用，不触发任何事件
                if (!this.__initializingAttrs && !isEqual(prev, val)) {
                    if (silent) {
                        changed[key] = [val, prev];
                    }
                    else {
                        this.trigger('change:' + key, val, prev, key);
                    }
                }
            }

            return this;
        };


        // Call this method to manually fire a `"change"` event for triggering
        // a `"change:attribute"` event for each changed attribute.
        attribute.change = function () {
            var changed = this.__changedAttrs;

            if (changed) {
                for (var key in changed) {
                    if (changed.hasOwnProperty(key)) {
                        var args = changed[key];
                        this.trigger('change:' + key, args[0], args[1], key);
                    }
                }
                delete this.__changedAttrs;
            }

            return this;
        };

        // for test
        attribute._isPlainObject = isPlainObject;

        // Helpers
        // -------

        var toString = Object.prototype.toString;
        var hasOwn = Object.prototype.hasOwnProperty;

        /**
         * Detect the JScript [[DontEnum]] bug:
         * In IE < 9 an objects own properties, shadowing non-enumerable ones, are
         * made non-enumerable as well.
         * https://github.com/bestiejs/lodash/blob/7520066fc916e205ef84cb97fbfe630d7c154158/lodash.js#L134-L144
         */
        /** Detect if own properties are iterated after inherited properties (IE < 9) */
        var iteratesOwnLast;
        (function () {
            var props = [];

            function Ctor() {
                this.x = 1;
            }

            Ctor.prototype = {'valueOf': 1, 'y': 1};
            for (var prop in new Ctor()) {
                props.push(prop);
            }
            iteratesOwnLast = props[0] !== 'x';
        }());

        var isArray = Array.isArray || function (val) {
                return toString.call(val) === '[object Array]';
            };

        function isString(val) {
            return toString.call(val) === '[object String]';
        }

        function isFunction(val) {
            return toString.call(val) === '[object Function]';
        }

        function isWindow(o) {
            return o != null && o == o.window;
        }

        function isPlainObject(o) {
            // Must be an Object.
            // Because of IE, we also have to check the presence of the constructor
            // property. Make sure that DOM nodes and window objects don't
            // pass through, as well
            if (!o || toString.call(o) !== "[object Object]" ||
                o.nodeType || isWindow(o)) {
                return false;
            }

            try {
                // Not own constructor property must be Object
                if (o.constructor && !hasOwn.call(o, "constructor") && !hasOwn.call(o.constructor.prototype, "isPrototypeOf")) {
                    return false;
                }
            } catch (e) {
                // IE8,9 Will throw exceptions on certain host objects #9897
                return false;
            }

            var key;

            // Support: IE<9
            // Handle iteration over inherited properties before own properties.
            // http://bugs.jquery.com/ticket/12199
            if (iteratesOwnLast) {
                for (key in o) {
                    return hasOwn.call(o, key);
                }
            }

            // Own properties are enumerated firstly, so to speed up,
            // if last one is own, then all properties are own.
            for (key in o) {
            }

            return key === undefined || hasOwn.call(o, key);
        }

        function isEmptyObject(o) {
            if (!o || toString.call(o) !== "[object Object]" ||
                o.nodeType || isWindow(o) || !o.hasOwnProperty) {
                return false;
            }

            for (var p in o) {
                if (o.hasOwnProperty(p)) return false;
            }
            return true;
        }

        function merge(receiver, supplier) {
            var key, value;

            for (key in supplier) {
                if (supplier.hasOwnProperty(key)) {
                    receiver[key] = cloneValue(supplier[key], receiver[key]);
                }
            }

            return receiver;
        }

        // 只 clone 数组和 plain object，其他的保持不变
        function cloneValue(value, prev) {
            if (isArray(value)) {
                value = value.slice();
            }
            else if (isPlainObject(value)) {
                isPlainObject(prev) || (prev = {});

                value = merge(prev, value);
            }

            return value;
        }

        var keys = Object.keys||function(obj){
				var keys=[];
				for(var x in obj) keys.push(x);
				return keys;
			};

        if (!keys) {
            keys = function (o) {
                var result = [];

                for (var name in o) {
                    if (o.hasOwnProperty(name)) {
                        result.push(name);
                    }
                }
                return result;
            };
        }

        function mergeInheritedAttrs(attrs, instance, specialProps) {
            var inherited = [];
            var proto = instance.constructor.prototype;

            while (proto) {
                // 不要拿到 prototype 上的
                if (!proto.hasOwnProperty('attrs')) {
                    proto.attrs = {};
                }

                // 将 proto 上的特殊 properties 放到 proto.attrs 上，以便合并
                copySpecialProps(specialProps, proto.attrs, proto);

                // 为空时不添加
                if (!isEmptyObject(proto.attrs)) {
                    inherited.unshift(proto.attrs);
                }

                // 向上回溯一级
                proto = proto.constructor.superclass;
            }

            // Merge and clone default values to instance.
            for (var i = 0, len = inherited.length; i < len; i++) {
                mergeAttrs(attrs, normalize(inherited[i]));
            }
        }

        function mergeUserValue(attrs, config) {
            mergeAttrs(attrs, normalize(config, true), true);
        }

        function copySpecialProps(specialProps, receiver, supplier, isAttr2Prop) {
            for (var i = 0, len = specialProps.length; i < len; i++) {
                var key = specialProps[i];

                if (supplier.hasOwnProperty(key)) {
                    receiver[key] = isAttr2Prop ? receiver.get(key) : supplier[key];
                }
            }
        }


        var EVENT_PATTERN = /^(on|before|after)([A-Z].*)$/;
        var EVENT_NAME_PATTERN = /^(Change)?([A-Z])(.*)/;

        function parseEventsFromAttrs(host, attrs) {
            for (var key in attrs) {
                if (attrs.hasOwnProperty(key)) {
                    var value = attrs[key].value, m;

                    if (isFunction(value) && (m = key.match(EVENT_PATTERN))) {
                        host[m[1]](getEventName(m[2]), value);
                        delete attrs[key];
                    }
                }
            }
        }

        // Converts `Show` to `show` and `ChangeTitle` to `change:title`
        function getEventName(name) {
            var m = name.match(EVENT_NAME_PATTERN);
            var ret = m[1] ? 'change:' : '';
            ret += m[2].toLowerCase() + m[3];
            return ret;
        }


        function setSetterAttrs(host, attrs, config) {
            var options = {silent: true};
            host.__initializingAttrs = true;

            for (var key in config) {
                if (config.hasOwnProperty(key)) {
                    if (attrs[key].setter) {
                        host.set(key, config[key], options);
                    }
                }
            }

            delete host.__initializingAttrs;
        }


        var ATTR_SPECIAL_KEYS = ['value', 'getter', 'setter', 'readOnly'];

        // normalize `attrs` to
        //
        //   {
        //      value: 'xx',
        //      getter: fn,
        //      setter: fn,
        //      readOnly: boolean
        //   }
        //
        function normalize(attrs, isUserValue) {
            var newAttrs = {};

            for (var key in attrs) {
                var attr = attrs[key];

                if (!isUserValue &&
                    isPlainObject(attr) &&
                    hasOwnProperties(attr, ATTR_SPECIAL_KEYS)) {
                    newAttrs[key] = attr;
                    continue;
                }

                newAttrs[key] = {
                    value: attr
                };
            }

            return newAttrs;
        }

        var ATTR_OPTIONS = ['setter', 'getter', 'readOnly'];
        // 专用于 attrs 的 merge 方法
        function mergeAttrs(attrs, inheritedAttrs, isUserValue) {
            var key, value;
            var attr;

            for (key in inheritedAttrs) {
                if (inheritedAttrs.hasOwnProperty(key)) {
                    value = inheritedAttrs[key];
                    attr = attrs[key];

                    if (!attr) {
                        attr = attrs[key] = {};
                    }

                    // 从严谨上来说，遍历 ATTR_SPECIAL_KEYS 更好
                    // 从性能来说，直接 人肉赋值 更快
                    // 这里还是选择 性能优先

                    // 只有 value 要复制原值，其他的直接覆盖即可
                    (value['value'] !== undefined) && (attr['value'] = cloneValue(value['value'], attr['value']));

                    // 如果是用户赋值，只要考虑value
                    if (isUserValue) continue;

                    for (var i in ATTR_OPTIONS) {
                        var option = ATTR_OPTIONS[i];
                        if (value[option] !== undefined) {
                            attr[option] = value[option];
                        }
                    }
                }
            }

            return attrs;
        }

        function hasOwnProperties(object, properties) {
            for (var i = 0, len = properties.length; i < len; i++) {
                if (object.hasOwnProperty(properties[i])) {
                    return true;
                }
            }
            return false;
        }


        // 对于 attrs 的 value 来说，以下值都认为是空值： null, undefined, '', [], {}
        function isEmptyAttrValue(o) {
            return o == null || // null, undefined
                (isString(o) || isArray(o)) && o.length === 0 || // '', []
                isEmptyObject(o); // {}
        }

        // 判断属性值 a 和 b 是否相等，注意仅适用于属性值的判断，非普适的 === 或 == 判断。
        function isEqual(a, b) {
            if (a === b) return true;

            if (isEmptyAttrValue(a) && isEmptyAttrValue(b)) return true;

            // Compare `[[Class]]` names.
            var className = toString.call(a);
            if (className != toString.call(b)) return false;

            switch (className) {

                // Strings, numbers, dates, and booleans are compared by value.
                case '[object String]':
                    // Primitives and their corresponding object wrappers are
                    // equivalent; thus, `"5"` is equivalent to `new String("5")`.
                    return a == String(b);

                case '[object Number]':
                    // `NaN`s are equivalent, but non-reflexive. An `equal`
                    // comparison is performed for other numeric values.
                    return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);

                case '[object Date]':
                case '[object Boolean]':
                    // Coerce dates and booleans to numeric primitive values.
                    // Dates are compared by their millisecond representations.
                    // Note that invalid dates with millisecond representations
                    // of `NaN` are not equivalent.
                    return +a == +b;

                // RegExps are compared by their source patterns and flags.
                case '[object RegExp]':
                    return a.source == b.source &&
                        a.global == b.global &&
                        a.multiline == b.multiline &&
                        a.ignoreCase == b.ignoreCase;

                // 简单判断数组包含的 primitive 值是否相等
                case '[object Array]':
                    var aString = a.toString();
                    var bString = b.toString();

                    // 只要包含非 primitive 值，为了稳妥起见，都返回 false
                    return aString.indexOf('[object') === -1 &&
                        bString.indexOf('[object') === -1 &&
                        aString === bString;
            }

            if (typeof a != 'object' || typeof b != 'object') return false;

            // 简单判断两个对象是否相等，只判断第一层
            if (isPlainObject(a) && isPlainObject(b)) {

                // 键值不相等，立刻返回 false
                if (!isEqual(keys(a), keys(b))) {
                    return false;
                }

                // 键相同，但有值不等，立刻返回 false
                for (var p in a) {
                    if (a[p] !== b[p]) return false;
                }

                return true;
            }

            // 其他情况返回 false, 以避免误判导致 change 事件没发生
            return false;
        }

        return attribute;

    })();

    var Events = (function () {

        var eventSplitter = /\s+/

        function Events() {
        }


        // Bind one or more space separated events, `events`, to a `callback`
        // function. Passing `"all"` will bind the callback to all events fired.
        Events.prototype.on = function (events, callback, context) {
            var cache, event, list
            if (!callback) return this

            cache = this.__events || (this.__events = {})
            events = events.split(eventSplitter)

            while (event = events.shift()) {
                list = cache[event] || (cache[event] = [])
                list.push(callback, context)
            }

            return this
        }

        Events.prototype.once = function (events, callback, context) {
            var that = this
            var cb = function () {
                that.off(events, cb)
                callback.apply(context || that, arguments)
            }
            return this.on(events, cb, context)
        }

        // Remove one or many callbacks. If `context` is null, removes all callbacks
        // with that function. If `callback` is null, removes all callbacks for the
        // event. If `events` is null, removes all bound callbacks for all events.
        Events.prototype.off = function (events, callback, context) {
            var cache, event, list, i

            // No events, or removing *all* events.
            if (!(cache = this.__events)) return this
            if (!(events || callback || context)) {
                delete this.__events
                return this
            }

            events = events ? events.split(eventSplitter) : keys(cache)

            // Loop through the callback list, splicing where appropriate.
            while (event = events.shift()) {
                list = cache[event]
                if (!list) continue

                if (!(callback || context)) {
                    delete cache[event]
                    continue
                }

                for (i = list.length - 2; i >= 0; i -= 2) {
                    if (!(callback && list[i] !== callback ||
                        context && list[i + 1] !== context)) {
                        list.splice(i, 2)
                    }
                }
            }

            return this
        }


        // Trigger one or many events, firing all bound callbacks. Callbacks are
        // passed the same arguments as `trigger` is, apart from the event name
        // (unless you're listening on `"all"`, which will cause your callback to
        // receive the true name of the event as the first argument).
        Events.prototype.trigger = function (events) {
            var cache, event, all, list, i, len, rest = [], args, returned = true;
            if (!(cache = this.__events)) return this

            events = events.split(eventSplitter)

            // Fill up `rest` with the callback arguments.  Since we're only copying
            // the tail of `arguments`, a loop is much faster than Array#slice.
            for (i = 1, len = arguments.length; i < len; i++) {
                rest[i - 1] = arguments[i]
            }

            // For each event, walk through the list of callbacks twice, first to
            // trigger the event, then to trigger any `"all"` callbacks.
            while (event = events.shift()) {
                // Copy callback lists to prevent modification.
                if (all = cache.all) all = all.slice()
                if (list = cache[event]) list = list.slice()

                // Execute event callbacks except one named "all"
                if (event !== 'all') {
                    returned = triggerEvents(list, rest, this) && returned
                }

                // Execute "all" callbacks.
                returned = triggerEvents(all, [event].concat(rest), this) && returned
            }

            return returned
        }

        Events.prototype.emit = Events.prototype.trigger


        // Helpers
        // -------

        var keys = Object.keys||function(obj){
				var keys=[];
				for(var x in obj) keys.push(x);
				return keys;
			}

        if (!keys) {
            keys = function (o) {
                var result = []

                for (var name in o) {
                    if (o.hasOwnProperty(name)) {
                        result.push(name)
                    }
                }
                return result
            }
        }

        // Mix `Events` to object instance or Class function.
        Events.mixTo = function (receiver) {
            receiver = isFunction(receiver) ? receiver.prototype : receiver
            var proto = Events.prototype

            var event = new Events
            for (var key in proto) {
                if (proto.hasOwnProperty(key)) {
                    copyProto(key)
                }
            }

            function copyProto(key) {
                receiver[key] = function () {
                    proto[key].apply(event, Array.prototype.slice.call(arguments))
                    return this
                }
            }
        }

        // Execute callbacks
        function triggerEvents(list, args, context) {
            var pass = true

            if (list) {
                var i = 0, l = list.length, a1 = args[0], a2 = args[1], a3 = args[2]
                // call is faster than apply, optimize less than 3 argu
                // http://blog.csdn.net/zhengyinhui100/article/details/7837127
                switch (args.length) {
                    case 0:
                        for (; i < l; i += 2) {
                            pass = list[i].call(list[i + 1] || context) !== false && pass
                        }
                        break;
                    case 1:
                        for (; i < l; i += 2) {
                            pass = list[i].call(list[i + 1] || context, a1) !== false && pass
                        }
                        break;
                    case 2:
                        for (; i < l; i += 2) {
                            pass = list[i].call(list[i + 1] || context, a1, a2) !== false && pass
                        }
                        break;
                    case 3:
                        for (; i < l; i += 2) {
                            pass = list[i].call(list[i + 1] || context, a1, a2, a3) !== false && pass
                        }
                        break;
                    default:
                        for (; i < l; i += 2) {
                            pass = list[i].apply(list[i + 1] || context, args) !== false && pass
                        }
                        break;
                }
            }
            // trigger will return false if one of the callbacks return false
            return pass;
        }

        function isFunction(func) {
            return Object.prototype.toString.call(func) === '[object Function]'
        }

        return Events;

    })();


    var Base = (function (Class, Events, Aspect, Attribute) {

        return Class.create({

            Implements: [Events, Aspect, Attribute],

            initialize: function (config) {
                this.initAttrs(config);

                // Automatically register `this._onChangeAttr` method as
                // a `change:attr` event handler.
                parseEventsFromInstance(this, this.attrs);
            },

            destroy: function () {

                this.off();

                for (var p in this) {
                    if (this.hasOwnProperty(p)) {
                        delete this[p];
                    }
                }

                // Destroy should be called only once, generate a fake destroy after called
                // https://github.com/aralejs/widget/issues/50
                this.destroy = function () {
                };
            }
        });


        function parseEventsFromInstance(host, attrs) {
            for (var attr in attrs) {
                if (attrs.hasOwnProperty(attr)) {
                    var m = '_onChange' + ucfirst(attr);
                    if (host[m]) {
                        host.on('change:' + attr, host[m]);
                    }
                }
            }
        }

        function ucfirst(str) {
            return str.charAt(0).toUpperCase() + str.substring(1);
        }


    })(Class, Events, Aspect, Attribute);

    return {Class:Class,base:Base};

})();