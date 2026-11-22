@main def tests(): Unit =
  Judge.check("get: 상태를 값으로, 상태는 그대로")(get[Int].run(5), (5, 5))
  Judge.check("set: 상태를 바꾸고 값은 Unit")(set(9).run(5), ((), 9))
  Judge.check("modify: 함수를 적용")(modify[Int](_ + 1).run(5), ((), 6))
  Judge.check("modify: 문자열 상태")(modify[String](_ + "!").run("a"), ((), "a!"))
  Judge.check("for 식으로 읽고 쓰고 다시 읽기")((for a <- get[Int]; _ <- set(a * 2); b <- get[Int] yield (a, b)).run(4), ((4, 8), 8))
  Judge.check("modify 두 번")(modify[Int](_ * 3).flatMap(_ => modify[Int](_ - 1)).run(2), ((), 5))
