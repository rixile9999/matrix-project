@main def tests(): Unit =
  Judge.check("fib(0)")(fib(0), 0)
  Judge.check("fib(1)")(fib(1), 1)
  Judge.check("fib(2)")(fib(2), 1)
  Judge.check("fib(7)")(fib(7), 13)
  Judge.check("fib(10)")(fib(10), 55)
  Judge.check("처음 12개")((0 to 11).map(fib).toList, scala.List(0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89))
  Judge.check("fib(46)은 Int 최대 범위")(fib(46), 1836311903)
