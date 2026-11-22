@main def tests(): Unit =
  Judge.check("0개")(firstPrimes(0), Nil)
  Judge.check("1개")(firstPrimes(1), List(2))
  Judge.check("2개")(firstPrimes(2), List(2, 3))
  Judge.check("5개")(firstPrimes(5), List(2, 3, 5, 7, 11))
  Judge.check("제곱수 경계(9, 25)")(firstPrimes(10), List(2, 3, 5, 7, 11, 13, 17, 19, 23, 29))
  Judge.check("25개의 마지막")(firstPrimes(25).last, 97)
  Judge.check("100개의 마지막")(firstPrimes(100).last, 541)
  Judge.check("1000개의 개수")(firstPrimes(1000).size, 1000)
