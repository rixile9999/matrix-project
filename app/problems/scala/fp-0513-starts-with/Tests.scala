def nat(n: Int): Stream[Int] = Stream.cons(n, nat(n + 1))

def alt(n: Int): Stream[Int] = Stream.cons(if n == 4 then 0 else n, alt(n + 1))

@main def tests(): Unit =
  Judge.check("접두사가 맞음")(Stream(1, 2, 3).startsWith(Stream(1, 2)), true)
  Judge.check("접두사가 아님")(Stream(1, 2, 3).startsWith(Stream(2, 3)), false)
  Judge.check("빈 접두사는 항상 참")((Stream(1).startsWith(Stream.empty), Stream.empty[Int].startsWith(Stream.empty)), (true, true))
  Judge.check("접두사가 더 길면 거짓")(Stream(1, 2).startsWith(Stream(1, 2, 3)), false)
  Judge.check("자기 자신")(Stream(1, 2, 3).startsWith(Stream(1, 2, 3)), true)
  Judge.check("빈 스트림은 비어 있지 않은 접두사로 시작하지 않음")(Stream.empty[Int].startsWith(Stream(1)), false)
  Judge.check("원본이 무한")((nat(1).startsWith(Stream(1, 2, 3)), nat(1).startsWith(Stream(1, 3))), (true, false))
  Judge.check("둘 다 무한이어도 불일치에서 끝남")(nat(1).startsWith(alt(1)), false)
