//! Generated by @thi.ng/wasm-api at 2022-11-04T13:45:54.420Z - DO NOT EDIT!

const std = @import("std");

pub const Task = struct {
    state: TaskState = .open,
    body: []const u8,
    dateCreated: u32,
    dateDone: u32 = 0,
};

pub const TaskState = enum(i32) {
    open,
    done,
};
